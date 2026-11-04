import fsSync from 'node:fs'
import path from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import log from './core/logger'
import { mt } from './core/i18n'

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
  tray.setToolTip(mt('app.trayTooltip'))

  const build = () => {
    const status = getStatusText?.() || mt('status.idle')
    return Menu.buildFromTemplate([
      { label: mt('tray.status', { status }), enabled: false },
      { type: 'separator' },
      { label: mt('tray.toggleWindow'), click: () => onToggleWindow?.() },
      { label: mt('tray.emergencyStop'), click: () => onEmergencyStop?.() },
      { type: 'separator' },
      { label: mt('tray.quit'), click: () => onQuit?.() },
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
