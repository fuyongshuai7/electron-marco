import { app, BrowserWindow, Menu, dialog, ipcMain, shell, systemPreferences } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import { uIOhook } from 'uiohook-napi'
import { createMarco } from './marco'
import { createAutoClick } from './autoClick'
import { createRecords } from './records'
import { pickFolder } from './recordsStore'
import { createTray } from './tray'
import log, { installGlobalErrorHandlers, getLogPath } from './core/logger'
import {
  getSettings,
  updateSettings,
  resetSettings,
  flushSettings,
  setHotkey,
  DEFAULT_HOTKEYS,
} from './core/settings'
import { createHotkeyManager, comboLabel } from './core/hotkey'

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

const hasWindow = () => mainWindow && !mainWindow.isDestroyed()

const send = (channel) => (payload, force = true) => {
  if (hasWindow()) mainWindow.webContents.send(channel, payload, force)
}

const createWindow = () => {
  const settings = getSettings()

  mainWindow = new BrowserWindow({
    width: 900,
    height: settings.window.height,
    resizable: true,
    minWidth: 900,
    maxWidth: 900,
    minHeight: 460,
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

/* ---------- 結束流程：先處理未儲存的錄製 ---------- */
async function requestClose({ force = false } = {}) {
  if (isQuitting) return
  if (!hasWindow()) return

  try {
    const unsaved = records?.hasUnsaved() || 0
    if (unsaved > 0) {
      const res = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['儲存並結束', '不儲存直接結束', '取消'],
        defaultId: 0,
        cancelId: 2,
        title: '尚有未儲存的錄製',
        message: `有 ${unsaved} 筆錄製尚未儲存，直接結束會遺失。`,
        detail: '選擇「儲存並結束」會先寫入本機資料夾再關閉。',
      })
      if (res.response === 2) return
      if (res.response === 0) records?.saveAll()
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
  startRecord: () => marco?.startRecord(),
  stopRecord: () => marco?.stopRecord(),
  play: () => marco?.play(),
  stopPlay: () => marco?.stopPlay(),
  startAutoClick: () => autoClick?.start(getSettings().autoClick),
  stopAutoClick: () => autoClick?.stop(),
  emergencyStop: () => emergencyStop(),
}

function emergencyStop() {
  log.warn('觸發緊急停止')
  if (autoClick?.emit) autoClick.stop()
  marco?.emergencyStop()
  hotkeys?.reset()
}

/* ---------- 全域輸入鉤子 ---------- */
function startHook() {
  try {
    uIOhook.start()
    uiohookReady = true
  } catch (err) {
    uiohookReady = false
    log.error('uIOhook 啟動失敗', err)
  }

  uIOhook.on('keydown', (e) => {
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
  ipcMain.handle('records:export', (_e, id) => (isId(id) ? records?.exportOne(mainWindow, id) : { ok: false, reason: 'invalid' }))
  ipcMain.handle('records:export-all', () => records?.exportAll(mainWindow))
  ipcMain.handle('records:import', () => records?.importOne(mainWindow))
  ipcMain.handle('records:open-folder', () => records?.openFolder())

  // 視窗 / 程式
  ipcMain.on('window:minimize', () => hasWindow() && mainWindow.minimize())
  ipcMain.on('window:hide', () => hasWindow() && tray && mainWindow.hide())
  ipcMain.on('window:toggle', () => toggleWindow())
  ipcMain.on('window:close', () => requestClose())
  ipcMain.on('app:quit', () => requestClose({ force: true }))
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
    onToggleWindow: toggleWindow,
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
  if (lastMarcoStatus.recording) return '錄製中'
  if (lastMarcoStatus.playing) return lastMarcoStatus.countdown > 0 ? `回放倒數 ${lastMarcoStatus.countdown}s` : `回放中 ${lastMarcoStatus.round}/${lastMarcoStatus.repeat || '∞'}`
  if (lastAutoClickStatus.running) return '連點中'
  return '待機'
}
