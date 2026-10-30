import { UiohookKey } from 'uiohook-napi'
import log from './logger'

export const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta']

export const MODIFIER_CODES = {
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight],
}

const MODIFIER_CODE_SET = new Set(Object.values(MODIFIER_CODES).flat())
const FLAG_OF = { ctrl: 'ctrlKey', alt: 'altKey', shift: 'shiftKey', meta: 'metaKey' }
const LABEL_OF = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }

const CODE_TO_NAME = new Map()
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number' && !CODE_TO_NAME.has(code)) CODE_TO_NAME.set(code, name)
}

export const isModifierCode = (code) => MODIFIER_CODE_SET.has(code)
export const keyNameOf = (code) => CODE_TO_NAME.get(code) || `Key_${code}`
export const keyCodeOf = (name) => (name in UiohookKey ? UiohookKey[name] : null)

/** 取得組合鍵中「實際按下」的修飾鍵 keycode，用來從錄製內容裡移除多餘的修飾鍵 */
export function comboModifierCodes(combo) {
  const codes = []
  for (const name of MODIFIERS) {
    if (combo?.[name]) codes.push(...MODIFIER_CODES[name])
  }
  return codes
}

export function comboLabel(combo) {
  if (!combo) return '未設定'
  const parts = MODIFIERS.filter((m) => combo[m]).map((m) => LABEL_OF[m])
  parts.push(combo.key || '?')
  return parts.join(' + ')
}

export function comboFromEvent(e) {
  return {
    ctrl: !!e.ctrlKey,
    alt: !!e.altKey,
    shift: !!e.shiftKey,
    meta: !!e.metaKey,
    key: keyNameOf(e.keycode),
  }
}

function sameCombo(e, combo) {
  if (!combo) return false
  for (const name of MODIFIERS) {
    if (!!e[FLAG_OF[name]] !== !!combo[name]) return false
  }
  const code = keyCodeOf(combo.key)
  return code != null && code === e.keycode
}

/**
 * 全域快捷鍵管理器。
 * - 以「組合鍵」觸發，避免單一功能鍵與其他軟體互相占用
 * - 提供 capture 模式，讓設定頁可以用真實按鍵錄製（而非手動選字）
 * - 記錄被快捷鍵「吃掉」的按鍵，錄製時不會把快捷鍵本身寫進腳本
 */
export function createHotkeyManager({ getBindings, onCaptured } = {}) {
  const pressed = new Set()
  const consumed = new Set()
  let capturing = false

  const bindings = () => getBindings?.() || {}

  const markConsumed = (combo, code) => {
    for (const modCode of comboModifierCodes(combo)) consumed.add(modCode)
    consumed.add(code)
  }

  function handleKeyDown(e) {
    const code = e.keycode
    const repeated = pressed.has(code)
    pressed.add(code)

    if (capturing) {
      // 修飾鍵本身不作為組合鍵的主鍵
      if (repeated || isModifierCode(code)) return null
      const combo = comboFromEvent(e)
      capturing = false
      onCaptured?.(combo)
      return { type: 'capture', combo }
    }

    // 長按時系統可能持續送出 keydown，只在第一次按下時觸發
    if (repeated) return null

    for (const [action, combo] of Object.entries(bindings())) {
      if (sameCombo(e, combo)) {
        markConsumed(combo, code)
        return { type: 'action', action, combo }
      }
    }
    return null
  }

  function handleKeyUp(e) {
    pressed.delete(e.keycode)
    consumed.delete(e.keycode)
  }

  return {
    handleKeyDown,
    handleKeyUp,
    isConsumed: (code) => consumed.has(code),
    isPressed: (code) => pressed.has(code),
    /** 錄製結束後清空按壓狀態，避免狀態殘留 */
    reset: () => {
      pressed.clear()
      consumed.clear()
    },
    startCapture: () => {
      capturing = true
      return true
    },
    cancelCapture: () => {
      capturing = false
    },
    isCapturing: () => capturing,
  }
}

/** 檢查是否缺少依賴導致快捷鍵完全無法使用 */
export function logModelWarnings(logger = log) {
  if (keyCodeOf('R') == null || keyCodeOf('Ctrl') == null) {
    logger.warn('UiohookKey 缺少必要的按鍵常數，快捷鍵可能無法運作')
  }
}
