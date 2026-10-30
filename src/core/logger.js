import fsSync from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const LOG_DIR = 'logs'
const LOG_FILE = 'marco.log'
const MAX_BYTES = 512 * 1024

let ready = false
let file = null

const getDir = () => path.join(app.getPath('userData'), LOG_DIR)
const getFile = () => path.join(getDir(), LOG_FILE)

const rotate = () => {
  try {
    const target = getFile()
    const stat = fsSync.statSync(target)
    if (stat.size < MAX_BYTES) return
    fsSync.renameSync(target, `${target}.1`)
  } catch {
    // 檔案不存在或無法讀取時直接略過
  }
}

const init = () => {
  if (ready) return
  try {
    fsSync.mkdirSync(getDir(), { recursive: true })
    rotate()
    file = getFile()
  } catch {
    file = null
  }
  ready = true
}

const stamp = () => new Date().toISOString()

const write = (level, args) => {
  init()
  const text = `[${stamp()}] [${level}] ${args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack || ''}`
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')}\n`

  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  console[fn](`[Marco][${level}]`, ...args)

  if (!file) return
  try {
    fsSync.appendFileSync(file, text, 'utf8')
  } catch {
    file = null
  }
}

export const log = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
}

/** 把程序崩潰 / 未捕捉例外記錄下來，避免使用者回報時沒有線索 */
export function installGlobalErrorHandlers() {
  const handler = (kind) => (err) => log.error(`${kind}:`, err)
  process.on('uncaughtException', handler('uncaughtException'))
  process.on('unhandledRejection', handler('unhandledRejection'))
}

export const getLogPath = () => {
  init()
  return file
}

export default log
