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

export function comboFromEvent(e, held = {}) {
  return {
    ctrl: !!e.ctrlKey || !!held.ctrl,
    alt: !!e.altKey || !!held.alt,
    shift: !!e.shiftKey || !!held.shift,
    meta: !!e.metaKey || !!held.meta,
    key: keyNameOf(e.keycode),
  }
}

/**
 * 判斷事件是否符合組合鍵。
 * 修飾鍵狀態同時看事件旗標與外部追蹤（held）：libuiohook 在鉤子啟動後的
 * 第一次按鍵序列會回報失效的修飾鍵掩碼（ctrlKey/altKey 全為 false），
 * 導致啟動後的第一個快捷鍵被靜默吞掉，因此用钩子流中追蹤的按下狀態兜底。
 */
function sameCombo(e, combo, held = {}) {
  if (!combo) return false
  for (const name of MODIFIERS) {
    const active = !!e[FLAG_OF[name]] || !!held[name]
    if (active !== !!combo[name]) return false
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
export function createHotkeyManager({ getBindings, getHeldModifiers, onCaptured } = {}) {
  const pressed = new Set()
  const consumed = new Set()
  let capturing = false

  const bindings = () => getBindings?.() || {}
  const held = () => getHeldModifiers?.() || {}

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
      const combo = comboFromEvent(e, held())
      capturing = false
      onCaptured?.(combo)
      return { type: 'capture', combo }
    }

    // 長按時系統可能持續送出 keydown，只在第一次按下時觸發
    if (repeated) return null

    for (const [action, combo] of Object.entries(bindings())) {
      if (sameCombo(e, combo, held())) {
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
