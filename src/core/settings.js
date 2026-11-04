import fsSync from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import log from './logger'

const FILE_NAME = 'settings.json'

let cache = null
let filePath = null
let persistTimer = null

const getPath = () => {
  if (!filePath) filePath = path.join(app.getPath('userData'), FILE_NAME)
  return filePath
}

/**
 * 組合鍵格式：{ ctrl, alt, shift, meta, key }
 * key 為 uiohook-napi UiohookKey 的名稱。
 */
export const DEFAULT_HOTKEYS = {
  startRecord: { ctrl: true, alt: true, shift: false, meta: false, key: 'F6' },
  stopRecord: { ctrl: true, alt: true, shift: false, meta: false, key: 'F7' },
  play: { ctrl: true, alt: true, shift: false, meta: false, key: 'F8' },
  stopPlay: { ctrl: true, alt: true, shift: false, meta: false, key: 'F9' },
  startAutoClick: { ctrl: true, alt: true, shift: false, meta: false, key: 'F10' },
  stopAutoClick: { ctrl: true, alt: true, shift: false, meta: false, key: 'F11' },
  emergencyStop: { ctrl: true, alt: true, shift: false, meta: false, key: 'F12' },
}

/** 舊版的預設組合鍵（Ctrl+Alt+字母），載入時自動升級成新的 F 鍵預設 */
const LEGACY_DEFAULT_KEYS = {
  startRecord: 'R',
  stopRecord: 'S',
  play: 'P',
  stopPlay: 'Q',
  startAutoClick: 'C',
  stopAutoClick: 'X',
  emergencyStop: 'K',
}

export const HOTKEY_LABELS = {
  startRecord: '開始錄製',
  stopRecord: '停止錄製',
  play: '回放',
  stopPlay: '停止回放',
  startAutoClick: '開始連點',
  stopAutoClick: '停止連點',
  emergencyStop: '緊急停止（全部）',
}

export const HOTKEY_ORDER = [
  'startRecord',
  'stopRecord',
  'play',
  'stopPlay',
  'startAutoClick',
  'stopAutoClick',
  'emergencyStop',
]

export const DEFAULTS = {
  version: 1,
  hotkeys: DEFAULT_HOTKEYS,
  playback: {
    // 回放的速度倍率
    speed: 1,
    // 回放次數，0 表示無限循環
    repeat: 1,
    // 每次事件間隔的隨機抖動百分比（反機械化偵測）
    jitter: 0,
    // 回放開始前的倒數秒數
    countdown: 3,
    // 回放滑鼠移動時是否使用平滑移動
    smoothMouse: false,
    // 每一輪回放之間的間隔（毫秒）
    loopGap: 600,
  },
  recording: {
    // 是否錄製滑鼠移動軌跡（會讓事件數大幅增加）
    captureMouseMove: false,
    // 錄製移動時的取樣間隔
    moveThrottleMs: 30,
    // 錄製移動時的最小位移，低於此距離不取樣
    moveMinDistance: 4,
  },
  persist: {
    // 空字串表示使用預設目錄（文件/Marco 錄製）
    folder: '',
    // records.json 的備份數量
    keepBackups: 3,
  },
  window: {
    closeToTray: true,
    launchAtLogin: false,
    height: 640,
  },
  ui: {
    // 介面語言：zh-Hant（繁體中文）或 en（English）
    locale: 'zh-Hant',
  },
  autoClick: {
    interval: 100,
    button: 'left',
    jitter: 0,
    pressDuration: 0,
    double: false,
    mode: 'cursor',
    x: 0,
    y: 0,
    maxClicks: 0,
    maxDurationMs: 0,
  },
}

const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)))

const merge = (base, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const cur = base?.[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = merge(cur, v)
    } else {
      out[k] = v
    }
  }
  return out
}

const sanitizeHotkey = (combo, fallback) => {
  if (!combo || typeof combo !== 'object') return { ...fallback }
  const bool = (v) => v === true
  return {
    ctrl: bool(combo.ctrl),
    alt: bool(combo.alt),
    shift: bool(combo.shift),
    meta: bool(combo.meta),
    key: typeof combo.key === 'string' && combo.key ? combo.key : fallback.key,
  }
}

const sanitize = (raw) => {
  const next = merge(clone(DEFAULTS), raw || {})
  const hotkeys = {}
  for (const name of HOTKEY_ORDER) {
    let combo = next.hotkeys?.[name]
    // 舊版預設（Ctrl+Alt+字母）升級為新的 Ctrl+Alt+F 鍵
    const legacyKey = LEGACY_DEFAULT_KEYS[name]
    if (
      legacyKey &&
      combo &&
      combo.ctrl === true &&
      combo.alt === true &&
      !combo.shift &&
      !combo.meta &&
      combo.key === legacyKey
    ) {
      combo = DEFAULT_HOTKEYS[name]
    }
    hotkeys[name] = sanitizeHotkey(combo, DEFAULT_HOTKEYS[name])
  }
  next.hotkeys = hotkeys

  const num = (v, min, max, fallback) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }
  const p = next.playback
  p.speed = num(p.speed, 0.1, 10, DEFAULTS.playback.speed)
  p.repeat = Math.round(num(p.repeat, 0, 9999, DEFAULTS.playback.repeat))
  p.jitter = num(p.jitter, 0, 80, DEFAULTS.playback.jitter)
  p.countdown = Math.round(num(p.countdown, 0, 30, DEFAULTS.playback.countdown))
  p.loopGap = Math.round(num(p.loopGap, 0, 60000, DEFAULTS.playback.loopGap))
  p.smoothMouse = !!p.smoothMouse

  const r = next.recording
  r.captureMouseMove = !!r.captureMouseMove
  r.moveThrottleMs = Math.round(num(r.moveThrottleMs, 5, 500, DEFAULTS.recording.moveThrottleMs))
  r.moveMinDistance = Math.round(num(r.moveMinDistance, 0, 200, DEFAULTS.recording.moveMinDistance))

  const s = next.persist
  s.folder = typeof s.folder === 'string' ? s.folder : ''
  s.keepBackups = Math.round(num(s.keepBackups, 0, 10, DEFAULTS.persist.keepBackups))

  const w = next.window
  w.closeToTray = !!w.closeToTray
  w.launchAtLogin = !!w.launchAtLogin
  w.height = Math.round(num(w.height, 460, 4000, DEFAULTS.window.height))

  const u = next.ui
  u.locale = u.locale === 'en' || u.locale === 'zh-Hant' ? u.locale : DEFAULTS.ui.locale

  const a = next.autoClick
  a.interval = Math.round(num(a.interval, 10, 3600000, DEFAULTS.autoClick.interval))
  a.button = ['left', 'right', 'middle'].includes(a.button) ? a.button : 'left'
  a.jitter = num(a.jitter, 0, 80, DEFAULTS.autoClick.jitter)
  a.pressDuration = Math.round(num(a.pressDuration, 0, 5000, DEFAULTS.autoClick.pressDuration))
  a.double = !!a.double
  a.mode = a.mode === 'fixed' ? 'fixed' : 'cursor'
  a.x = Math.round(num(a.x, -32768, 32768, 0))
  a.y = Math.round(num(a.y, -32768, 32768, 0))
  a.maxClicks = Math.round(num(a.maxClicks, 0, 1000000, 0))
  a.maxDurationMs = Math.round(num(a.maxDurationMs, 0, 86400000, 0))

  return next
}

const loadSync = () => {
  try {
    const data = fsSync.readFileSync(getPath(), 'utf8')
    return sanitize(JSON.parse(data))
  } catch {
    return sanitize(null)
  }
}

export function getSettings() {
  if (!cache) cache = loadSync()
  return cache
}

export function updateSettings(patch = {}) {
  const next = sanitize(merge(getSettings(), patch))
  cache = next
  schedulePersist()
  return next
}

export function replaceSettings(nextRaw) {
  const next = sanitize(nextRaw)
  cache = next
  schedulePersist()
  return next
}

export function resetSettings() {
  cache = sanitize(null)
  schedulePersist()
  return cache
}

export function setHotkey(name, combo) {
  if (!DEFAULT_HOTKEYS[name]) return getSettings()
  const hotkeys = { ...getSettings().hotkeys }
  hotkeys[name] = sanitizeHotkey(combo, DEFAULT_HOTKEYS[name])
  return updateSettings({ hotkeys })
}

export function setFolder(folder) {
  return updateSettings({ persist: { folder: String(folder || '') } })
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    flushSettings()
  }, 300)
}

export function flushSettings() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  try {
    const snapshot = JSON.stringify(getSettings(), null, 2)
    fsSync.mkdirSync(path.dirname(getPath()), { recursive: true })
    const tmp = `${getPath()}.tmp`
    fsSync.writeFileSync(tmp, snapshot, 'utf8')
    fsSync.renameSync(tmp, getPath())
    return true
  } catch (err) {
    log.error('flushSettings failed', err)
    return false
  }
}

export const getSettingsPath = getPath
