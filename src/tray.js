import fsSync from 'node:fs'
import path from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import log from './core/logger'

/** 開發環境用專案根目錄的 build/，打包後取 resourcesPath 的 extraResource */
function resolveIcon() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'build', 'icon.png'), path.join(process.resourcesPath, 'icon.png')]
    : [path.join(app.getAppPath(), 'build', 'icon.png')]

  // Electron 在 Windows 上偏好 .ico
  const file = candidates.concat(app.isPackaged ? [path.join(process.resourcesPath, 'build', 'icon.ico')] : []).find((p) => {
    try {
      return fsSync.existsSync(p)
    } catch {
      return false
    }
  })

  if (!file) return null
  const image = nativeImage.createFromPath(file)
  return image.isEmpty() ? null : image
}

export function createTray({ getStatusText, onToggleWindow, onEmergencyStop, onQuit }) {
  const image = resolveIcon()
  if (!image) {
    log.warn('找不到托盤圖示，已略過托盤建立')
    return null
  }

  const tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('Marco · 鍵鼠自動化')

  const build = () => {
    const status = getStatusText?.() || '待機'
    return Menu.buildFromTemplate([
      { label: `狀態：${status}`, enabled: false },
      { type: 'separator' },
      { label: '顯示 / 隱藏視窗', click: () => onToggleWindow?.() },
      { label: '緊急停止（錄製 / 回放 / 連點）', click: () => onEmergencyStop?.() },
      { type: 'separator' },
      { label: '結束程式', click: () => onQuit?.() },
    ])
  }

  tray.setContextMenu(build())
  tray.on('click', () => onToggleWindow?.())

  return {
    tray,
    refresh: () => tray.setContextMenu(build()),
    setTitle: (text) => tray.setTitle?.(text),
    destroy: () => {
      tray.destroy()
    },
  }
}
