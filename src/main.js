import { app, BrowserWindow, Menu, ipcMain, shell, systemPreferences } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import { uIOhook } from 'uiohook-napi'
import { createMarco } from './marco'
import { createAutoClick } from './autoClick'
import { createRecords } from './records'
import { pickFolder } from './recordsStore'
import { createTray } from './tray'
import log, { installGlobalErrorHandlers, getLogPath } from './core/logger'
import { mt } from './core/i18n'
import {
  getSettings,
  updateSettings,
  resetSettings,
  flushSettings,
  setHotkey,
  DEFAULT_HOTKEYS,
} from './core/settings'
import { createHotkeyManager, comboLabel, MODIFIER_CODES, isModifierCode } from './core/hotkey'

if (started) {
  app.quit()
}

installGlobalErrorHandlers()

// 單一實例：避免兩個視窗同時掛 global hook，並造成 records.json 互相覆蓋
const gotSingleInstance = app.requestSingleInstanceLock()
if (!gotSingleInstance) {
  app.quit()
}

let mainWindow = null
let marco = null
let autoClick = null
let records = null
let tray = null
let hotkeys = null
let isQuitting = false
let captureTarget = null
let uiohookReady = false
let lastMarcoStatus = {}
let lastAutoClickStatus = {}

// 迷你懸浮窗尺寸（完整模式寬度 1000 由 createWindow 使用）
const MINI_W = 420
const MINI_H = 64

const hasWindow = () => mainWindow && !mainWindow.isDestroyed()

const send = (channel) => (payload, force = true) => {
  if (hasWindow()) mainWindow.webContents.send(channel, payload, force)
}

const createWindow = () => {
  const settings = getSettings()
  const isMini = settings.window.mode === 'mini'

  mainWindow = new BrowserWindow({
    width: isMini ? MINI_W : 1000,
    height: isMini ? MINI_H : settings.window.height,
    resizable: !isMini,
    minWidth: isMini ? MINI_W : 1000,
    maxWidth: isMini ? MINI_W : 1000,
    minHeight: isMini ? MINI_H : 460,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0c16',
    show: false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'build', 'icon.ico') : path.join(app.getAppPath(), 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 明確宣告安全設定，避免依賴版本預設值
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  if (isMini) {
    const { miniX, miniY } = settings.window
    if (miniX != null && miniY != null) mainWindow.setPosition(miniX, miniY)
    else mainWindow.center()
    mainWindow.setAlwaysOnTop(!!settings.window.pinned)
  }

  mainWindow.webContents.once('did-finish-load', () => {
    marco?.emit()
    autoClick?.emit()
    records?.emit()
    send('settings:changed')(getSettings())
    send('hook:status')({ ready: uiohookReady })
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('resize', () => {
    if (!hasWindow()) return
    // 迷你模式尺寸鎖死，程式化 setSize 也會觸發 resize，避免把迷你高度寫進 height
    if (getSettings().window.mode === 'mini') return
    const [, height] = mainWindow.getSize()
    updateSettings({ window: { height } })
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    requestClose()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

const showWindow = () => {
  if (!hasWindow()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const toggleWindow = () => {
  if (!hasWindow()) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showWindow()
}

/* ---------- 精簡模式 / 迷你懸浮窗 ---------- */
function applyWindowMode(mode = getSettings().window.mode) {
  if (!hasWindow()) return
  if (mode === 'mini') {
    mainWindow.setMinimumSize(MINI_W, MINI_H)
    mainWindow.setMaximumSize(MINI_W, MINI_H)
    mainWindow.setSize(MINI_W, MINI_H)
    mainWindow.setResizable(false)
    const { miniX, miniY } = getSettings().window
    if (miniX != null && miniY != null) mainWindow.setPosition(miniX, miniY)
    else mainWindow.center()
    mainWindow.setAlwaysOnTop(!!getSettings().window.pinned)
  } else {
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(1000, 460)
    mainWindow.setMaximumSize(1000, 4000)
    mainWindow.setSize(1000, getSettings().window.height)
    mainWindow.setAlwaysOnTop(false)
  }
}

function setMode(mode) {
  if (!hasWindow()) return
  const prev = getSettings().window.mode
  const target = mode === 'mini' ? 'mini' : 'full'
  if (prev === target) return
  if (prev === 'mini') {
    const [x, y] = mainWindow.getPosition()
    updateSettings({ window: { mode: target, miniX: x, miniY: y } })
  } else {
    updateSettings({ window: { mode: target } })
  }
  applyWindowMode(target)
  send('settings:changed')(getSettings())
  tray?.refresh()
}

function toggleMiniMode() {
  setMode(getSettings().window.mode === 'mini' ? 'full' : 'mini')
}

function setPinned(on) {
  updateSettings({ window: { pinned: !!on } })
  if (getSettings().window.mode === 'mini' && hasWindow()) {
    mainWindow.setAlwaysOnTop(!!on)
  }
  send('settings:changed')(getSettings())
}

/* ---------- 自繪確認對話框（取代系統 showMessageBox） ---------- */
let dialogSeq = 0
const pendingDialogs = new Map()
function askRenderer(win, payload) {
  return new Promise((resolve) => {
    const id = ++dialogSeq
    const timer = setTimeout(() => {
      if (pendingDialogs.has(id)) {
        pendingDialogs.delete(id)
        resolve(payload.cancelId)
      }
    }, 60000)
    pendingDialogs.set(id, (index) => {
      clearTimeout(timer)
      resolve(index)
    })
    if (win && !win.isDestroyed()) win.webContents.send('dialog:ask', { id, ...payload })
    else {
      clearTimeout(timer)
      pendingDialogs.delete(id)
      resolve(payload.cancelId)
    }
  })
}

/* ---------- 結束流程：先處理未儲存的錄製 ---------- */
async function requestClose({ force = false } = {}) {
  if (isQuitting) return
  if (!hasWindow()) return

  try {
    const unsaved = records?.hasUnsaved() || 0
    if (unsaved > 0) {
      const res = await askRenderer(mainWindow, {
        kind: 'warning',
        buttons: [
          { label: mt('dialog.saveAndQuit'), kind: 'primary' },
          { label: mt('dialog.quitWithoutSave'), kind: 'danger' },
          { label: mt('dialog.cancel'), kind: 'ghost' },
        ],
        defaultId: 0,
        cancelId: 2,
        title: mt('dialog.unsavedTitle'),
        message: mt('dialog.unsavedMessage', { count: unsaved }),
        detail: mt('dialog.unsavedDetail'),
      })
      if (res === 2) return
      if (res === 0) records?.saveAll()
    }

    const settings = getSettings()
    if (settings.window.closeToTray && tray && !force) {
      mainWindow.hide()
      return
    }
    quitApp()
  } catch (err) {
    log.error('requestClose failed', err)
  }
}

function quitApp() {
  isQuitting = true
  app.quit()
}

/* ---------- 設定同步 ---------- */
function applySettings(next = getSettings()) {
  marco?.setOptions({ ...next.playback, ...next.recording })
  records?.configure({ folder: next.persist.folder, keepBackups: next.persist.keepBackups })
  records?.emit()
  try {
    app.setLoginItemSettings({ openAtLogin: !!next.window.launchAtLogin })
  } catch (err) {
    log.warn('設定開機自啟失敗', err)
  }
  send('settings:changed')(next)
  tray?.refresh()
}

const HOTKEY_ACTIONS = {
  startRecord: () => {
    const ok = marco?.startRecord()
    log[ok ? 'info' : 'warn'](`startRecord → ${ok}`)
  },
  stopRecord: () => {
    const ok = marco?.stopRecord()
    const n = marco?.getEvents().length ?? 0
    log[ok ? 'info' : 'warn'](`stopRecord → ${ok}, events=${n}`)
  },
  play: () => {
    const ok = marco?.play()
    const n = marco?.getEvents().length ?? 0
    log[ok ? 'info' : 'warn'](`play → ${ok}, events=${n}`)
  },
  stopPlay: () => {
    const ok = marco?.stopPlay()
    log.info(`stopPlay → ${ok}`)
  },
  startAutoClick: () => autoClick?.start(getSettings().autoClick),
  stopAutoClick: () => autoClick?.stop(),
  emergencyStop: () => emergencyStop(),
  toggleMini: () => toggleMiniMode(),
}

function emergencyStop() {
  log.warn('觸發緊急停止')
  if (autoClick?.emit) autoClick.stop()
  marco?.emergencyStop()
  hotkeys?.reset()
}

/* ---------- 全域輸入鉤子 ---------- */
// 自行追蹤修飾鍵按下狀態：libuiohook 啟動後第一次按鍵的修飾鍵旗標會失效，
// 這裡的追蹤作為事件旗標的兜底，避免啟動後第一個快捷鍵被吞掉
const heldModifierCodes = new Set()
const heldFlags = () => {
  const flags = { ctrl: false, alt: false, shift: false, meta: false }
  for (const code of heldModifierCodes) {
    for (const [name, codes] of Object.entries(MODIFIER_CODES)) {
      if (codes.includes(code)) flags[name] = true
    }
  }
  return flags
}

function startHook() {
  try {
    uIOhook.start()
    uiohookReady = true
    log.info(`hook started at +${Math.round(process.uptime() * 1000)}ms after process start`)
  } catch (err) {
    uiohookReady = false
    log.error('uIOhook 啟動失敗', err)
  }

  uIOhook.on('keydown', (e) => {
    if (isModifierCode(e.keycode)) heldModifierCodes.add(e.keycode)
    const res = hotkeys?.handleKeyDown(e)
    if (res?.type === 'capture') {
      if (captureTarget) {
        const action = captureTarget
        captureTarget = null
        setHotkey(action, res.combo)
        send('hotkeys:captured')({ action, combo: res.combo, label: comboLabel(res.combo) })
        send('settings:changed')(getSettings())
      }
      return
    }
    if (res?.type === 'action') {
      marco?.consumeCombo(res.combo)
      HOTKEY_ACTIONS[res.action]?.()
      return
    }
    marco?.handleKeyDown(e)
  })

  uIOhook.on('keyup', (e) => {
    heldModifierCodes.delete(e.keycode)
    const wasConsumed = hotkeys?.isConsumed(e.keycode)
    hotkeys?.handleKeyUp(e)
    if (wasConsumed) return
    marco?.handleKeyUp(e)
  })

  uIOhook.on('mousedown', (e) => marco?.handleMouse(e, 'mouse'))
  uIOhook.on('mouseup', (e) => marco?.handleMouse(e, 'mouse'))
  uIOhook.on('mousemove', (e) => marco?.handleMouse(e, 'move'))
  uIOhook.on('wheel', (e) => marco?.handleMouse(e, 'wheel'))
}

const checkPermissionTip = () => {
  if (process.platform !== 'darwin') return
  try {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      log.warn('macOS 尚未授予「輔助使用」權限，快捷鍵可能無法作用')
      send('hook:status')({ ready: uiohookReady, needPermission: true })
    }
  } catch {
    // 舊版 API 可能不存在
  }
}

/* ---------- IPC ---------- */
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length < 128
const toInt = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const registerIpc = () => {
  // 設定
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch) => {
    const next = updateSettings(patch && typeof patch === 'object' ? patch : {})
    applySettings(next)
    return next
  })
  ipcMain.handle('settings:reset', () => {
    const next = resetSettings()
    applySettings(next)
    return next
  })

  // 快捷鍵
  ipcMain.handle('hotkeys:capture-start', (_e, action) => {
    if (!DEFAULT_HOTKEYS[action] || typeof action !== 'string') return false
    captureTarget = action
    hotkeys?.startCapture()
    return true
  })
  ipcMain.handle('hotkeys:capture-cancel', () => {
    captureTarget = null
    hotkeys?.cancelCapture()
    return true
  })
  ipcMain.handle('hotkeys:set', (_e, action, combo) => {
    if (!DEFAULT_HOTKEYS[action]) return null
    const next = setHotkey(action, combo)
    send('settings:changed')(next)
    return next
  })

  // 錄製 / 回放
  ipcMain.handle('marco:set-options', (_e, patch) => {
    const next = getSettings()
    const playback = { ...next.playback }
    const recording = { ...next.recording }
    const src = patch && typeof patch === 'object' ? patch : {}
    for (const [k, v] of Object.entries(src)) {
      if (k in playback) playback[k] = v
      if (k in recording) recording[k] = v
    }
    const merged = updateSettings({ playback, recording })
    applySettings(merged)
    return merged
  })

  // 連點
  ipcMain.handle('autoclick:configure', (_e, options = {}) => {
    const merged = updateSettings({ autoClick: options && typeof options === 'object' ? options : {} })
    applySettings(merged)
    return merged.autoClick
  })
  ipcMain.handle('autoclick:start', (_e, options) => {
    if (options && typeof options === 'object') {
      const merged = updateSettings({ autoClick: options })
      applySettings(merged)
      autoClick?.start(merged.autoClick)
      return true
    }
    autoClick?.start(getSettings().autoClick)
    return true
  })
  ipcMain.handle('autoclick:stop', () => autoClick?.stop())
  ipcMain.handle('autoclick:get-pos', () => autoClick?.getPosition() || null)

  // 錄製清單
  ipcMain.handle('records:get', () => records?.emit())
  ipcMain.handle('records:select', (_e, id) => (isId(id) ? records?.select(id) : false))
  ipcMain.handle('records:save', (_e, id) => (isId(id) ? records?.save(id) : false))
  ipcMain.handle('records:save-all', () => records?.saveAll() || 0)
  ipcMain.handle('records:has-unsaved', () => records?.hasUnsaved() || 0)
  ipcMain.handle('records:rename', (_e, id, name) =>
    isId(id) && typeof name === 'string' ? records?.rename(id, name.slice(0, 200)) : false
  )
  ipcMain.handle('records:move', (_e, id, delta) => (isId(id) ? records?.move(id, toInt(delta)) : false))
  ipcMain.handle('records:move-to', (_e, id, index) => (isId(id) ? records?.moveTo(id, toInt(index, -1)) : false))
  ipcMain.handle('records:duplicate', (_e, id) => (isId(id) ? !!records?.duplicate(id) : false))
  ipcMain.handle('records:merge', (_e, ids) =>
    Array.isArray(ids) && ids.length > 1 ? !!records?.merge(ids.filter(isId)) : false
  )
  ipcMain.handle('records:trim', (_e, id, opts) =>
    isId(id) ? records?.trimTime(id, opts && typeof opts === 'object' ? opts : {}) : false
  )
  ipcMain.handle('records:trim-before', (_e, id, index) => (isId(id) ? records?.trimBefore(id, toInt(index, -1)) : false))
  ipcMain.handle('records:truncate-at', (_e, id, index) => (isId(id) ? records?.truncateAt(id, toInt(index, -1)) : false))
  ipcMain.handle('records:remove-event', (_e, id, index) => (isId(id) ? records?.removeEvent(id, toInt(index, -1)) : false))
  ipcMain.handle('records:list-events', (_e, id) => (isId(id) ? records?.listEvents(id) : { events: [], total: 0 }))
  ipcMain.handle('records:remove', (_e, id) => (isId(id) ? records?.remove(id) : false))
  ipcMain.handle('records:clear', async () => {
    const count = records?.count() ?? 0
    if (!count) return { ok: false, reason: 'empty' }
    const idx = await askRenderer(mainWindow, {
      kind: 'warning',
      buttons: [
        { label: mt('dialog.clearAllConfirm'), kind: 'danger' },
        { label: mt('dialog.cancel'), kind: 'ghost' },
      ],
      defaultId: 1,
      cancelId: 1,
      title: mt('dialog.clearAllTitle'),
      message: mt('dialog.clearAllMessage', { count }),
      detail: mt('dialog.clearAllDetail'),
    })
    if (idx !== 0) return { ok: false, reason: 'canceled' }
    return { ok: true, count: records.clearAll() }
  })
  ipcMain.handle('dialog:answer', (_e, id, index) => {
    const resolve = pendingDialogs.get(id)
    if (!resolve) return false
    pendingDialogs.delete(id)
    resolve(index)
    return true
  })
  ipcMain.handle('records:export', (_e, id) => (isId(id) ? records?.exportOne(mainWindow, id) : { ok: false, reason: 'invalid' }))
  ipcMain.handle('records:export-all', () => records?.exportAll(mainWindow))
  ipcMain.handle('records:import', () => records?.importOne(mainWindow))
  ipcMain.handle('records:open-folder', () => records?.openFolder())

  // 錄製 / 回放按鈕（迷你窗用，快捷鍵與按鈕共用同一主程序邏輯）
  ipcMain.handle('marco:start-record', () => marco?.startRecord())
  ipcMain.handle('marco:stop-record', () => marco?.stopRecord())
  ipcMain.handle('marco:play', () => marco?.play())
  ipcMain.handle('marco:stop-play', () => marco?.stopPlay())

  // 視窗 / 程式
  ipcMain.on('window:minimize', () => hasWindow() && mainWindow.minimize())
  ipcMain.on('window:hide', () => hasWindow() && tray && mainWindow.hide())
  ipcMain.on('window:toggle', () => toggleWindow())
  ipcMain.on('window:close', () => requestClose())
  ipcMain.handle('window:set-mode', (_e, mode) => setMode(mode))
  ipcMain.handle('window:toggle-pin', () => setPinned(!getSettings().window.pinned))
  ipcMain.on('app:quit', () => requestClose({ force: true }))
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:pick-folder', async () => {
    const folder = await pickFolder(mainWindow)
    if (!folder) return null
    const next = updateSettings({ persist: { folder } })
    applySettings(next)
    return folder
  })
  ipcMain.handle('app:open-folder', (_e, target) => {
    if (target === 'logs') {
      const dir = getLogPath()
      if (dir) shell.openPath(path.dirname(dir))
      else records?.openFolder()
      return true
    }
    if (target === 'records') {
      records?.openFolder()
      return true
    }
    return false
  })
}

/* ---------- 生命週期 ---------- */
app.whenReady().then(() => {
  const settings = getSettings()

  hotkeys = createHotkeyManager({
    getBindings: () => getSettings().hotkeys,
    getHeldModifiers: heldFlags,
    onCaptured: (combo) => log.info('capture combo', combo),
  })

  const onAutoClickStatus = (payload, force) => {
    const changed = lastAutoClickStatus.running !== payload.running
    lastAutoClickStatus = payload
    send('autoclick:status')(payload, force)
    if (changed) tray?.refresh()
  }

  const onMarcoStatus = (payload, force) => {
    const changed =
      lastMarcoStatus.recording !== payload.recording || lastMarcoStatus.playing !== payload.playing
    lastMarcoStatus = payload
    send('marco:status')(payload, force)
    if (changed) tray?.refresh()
  }

  autoClick = createAutoClick(onAutoClickStatus)

  records = createRecords(send('records:changed'), {
    onSelect: (events) => marco?.setEvents(events),
  })

  marco = createMarco(onMarcoStatus, {
    onRecorded: (events) => records?.addFromRecording(events),
  })

  records.configure({ folder: settings.persist.folder, keepBackups: settings.persist.keepBackups })
  marco.setOptions({ ...settings.playback, ...settings.recording })

  registerIpc()
  Menu.setApplicationMenu(null)

  createWindow()

  records.load().catch((err) => log.error('載入錄製失敗', err))

  startHook()
  checkPermissionTip()

  try {
    app.setLoginItemSettings({ openAtLogin: !!settings.window.launchAtLogin })
  } catch (err) {
    log.warn('設定開機自啟失敗', err)
  }

  tray = createTray({
    getStatusText: () => statusText(),
    getMode: () => getSettings().window.mode,
    onToggleWindow: toggleWindow,
    onToggleMini: toggleMiniMode,
    onEmergencyStop: emergencyStop,
    onQuit: () => requestClose({ force: true }),
  })

  if (!uiohookReady) {
    send('hook:status')({ ready: false })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => showWindow())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  try {
    uIOhook.stop()
  } catch (err) {
    log.warn('停止 uIOhook 失敗', err)
  }
  autoClick?.stop()
  marco?.stopPlay()
  marco?.releaseAll()
  records?.flush()
  flushSettings()
})

function statusText() {
  if (lastMarcoStatus.recording) return mt('status.recording')
  if (lastMarcoStatus.playing) {
    return lastMarcoStatus.countdown > 0
      ? mt('status.playCountdown', { n: lastMarcoStatus.countdown })
      : mt('status.playing', {
          round: lastMarcoStatus.round,
          total: lastMarcoStatus.repeat || mt('status.infinite'),
        })
  }
  if (lastAutoClickStatus.running) return mt('status.clicking')
  return mt('status.idle')
}
