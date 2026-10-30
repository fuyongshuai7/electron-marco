import fsSync from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, dialog, shell } from 'electron'
import log from './core/logger'

// 統一存放錄製與匯出檔案的資料夾
const FOLDER_NAME = 'Marco 錄製'
const DB_FILE = 'records.json'

let cachedFolder = null
let overrideFolder = null

export function getFolderPath() {
  if (cachedFolder) return cachedFolder
  if (overrideFolder) {
    cachedFolder = overrideFolder
    return cachedFolder
  }
  let base = null
  try {
    base = app.getPath('documents')
  } catch {
    base = null
  }
  if (!base) base = app.getPath('userData')
  cachedFolder = path.join(base, FOLDER_NAME)
  return cachedFolder
}

/** 由設定頁指定自訂資料目錄，傳入空值表示回到預設目錄 */
export function setFolderPath(next) {
  const value = typeof next === 'string' ? next.trim() : ''
  overrideFolder = value || null
  cachedFolder = null
  return getFolderPath()
}

/** 讓使用者挑選資料目錄 */
export async function pickFolder(parent) {
  const result = await dialog.showOpenDialog(parent || undefined, {
    title: '選擇錄製存放資料夾',
    defaultPath: getFolderPath(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return setFolderPath(result.filePaths[0])
}

/** 寫入前先輪替備份，避免 records.json 損壞後無法還原 */
function rotateBackup(file, keep) {
  const count = Number(keep) || 0
  if (count <= 0) return
  try {
    if (!fsSync.existsSync(file)) return
    for (let i = count; i >= 1; i -= 1) {
      const src = i === 1 ? file : `${file}.bak.${i - 1}`
      const dst = `${file}.bak.${i}`
      if (fsSync.existsSync(src)) fsSync.renameSync(src, dst)
    }
  } catch (err) {
    log.warn('輪替備份失敗', err)
  }
}

export const safeFileName = (name) => {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .trim()
  return cleaned || 'recording'
}

const ensureFolder = async () => {
  const dir = getFolderPath()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

const dbPath = () => path.join(getFolderPath(), DB_FILE)

export async function openFolder() {
  const dir = await ensureFolder()
  await shell.openPath(dir)
  return dir
}

export async function loadRecords() {
  try {
    const data = await fs.readFile(dbPath(), 'utf8')
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r) => r && typeof r.id === 'string' && Array.isArray(r.events))
      .map((r) => ({
        id: r.id,
        name: String(r.name || '未命名'),
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || r.createdAt || Date.now(),
        events: r.events,
      }))
  } catch {
    return []
  }
}

const serialize = (records) =>
  JSON.stringify(
    (records || []).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      events: r.events,
    })),
    null,
    2
  )

export async function saveRecords(records, keepBackups = 0) {
  const dir = await ensureFolder()
  const file = path.join(dir, DB_FILE)
  const tmp = `${file}.tmp`
  rotateBackup(file, keepBackups)
  await fs.writeFile(tmp, serialize(records), 'utf8')
  await fs.rename(tmp, file)
  return file
}

// 結束程式前同步寫入，避免防抖尚未落檔
export function saveRecordsSync(records, keepBackups = 0) {
  try {
    const dir = getFolderPath()
    fsSync.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, DB_FILE)
    const tmp = `${file}.tmp`
    rotateBackup(file, keepBackups)
    // 同樣採用 tmp + rename，避免寫到一半被中斷而損壞 records.json
    fsSync.writeFileSync(tmp, serialize(records), 'utf8')
    fsSync.renameSync(tmp, file)
    return file
  } catch (err) {
    log.error('saveRecordsSync failed', err)
    return null
  }
}

const timestamp = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

const pickSavePath = async (parent, title, defaultName) => {
  const dir = await ensureFolder()
  const result = await dialog.showSaveDialog(parent || undefined, {
    title,
    defaultPath: path.join(dir, defaultName),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

// 匯出單筆錄製：由使用者選擇存放位置，預設落在統一資料夾
export async function exportRecord(parent, record) {
  const file = await pickSavePath(
    parent,
    '匯出錄製',
    `${safeFileName(record.name)}.json`
  )
  if (!file) return { ok: false, reason: 'canceled' }
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        version: 1,
        name: record.name,
        exportedAt: Date.now(),
        events: record.events,
      },
      null,
      2
    ),
    'utf8'
  )
  return { ok: true, path: file, name: record.name, count: record.events.length }
}

// 匯出整份列表：由使用者選擇存放位置
export async function exportAllRecords(parent, records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, reason: 'empty' }
  }
  const file = await pickSavePath(
    parent,
    '匯出全部錄製',
    `marco-錄製-${timestamp()}.json`
  )
  if (!file) return { ok: false, reason: 'canceled' }
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        version: 1,
        exportedAt: Date.now(),
        records: records.map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          events: r.events,
        })),
      },
      null,
      2
    ),
    'utf8'
  )
  return { ok: true, path: file, count: records.length }
}

// 匯入單筆錄製或整份列表
export async function importRecord(parent) {
  const result = await dialog.showOpenDialog(parent || undefined, {
    title: '匯入錄製',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, reason: 'canceled' }
  }
  try {
    const filePath = result.filePaths[0]
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    const baseName = path.basename(filePath, path.extname(filePath))

    // 整份列表格式
    if (Array.isArray(parsed?.records)) {
      const list = parsed.records
        .filter((r) => r && Array.isArray(r.events) && r.events.length)
        .map((r) => ({
          events: r.events,
          name: String(r.name || '').trim() || baseName,
        }))
      if (!list.length) {
        return { ok: false, reason: 'invalid', message: '檔案內沒有可匯入的錄製' }
      }
      return { ok: true, multiple: true, list, name: baseName }
    }

    // 單筆格式
    const events = Array.isArray(parsed) ? parsed : parsed?.events
    if (!Array.isArray(events) || events.length === 0) {
      return { ok: false, reason: 'invalid', message: '檔案格式不正確或沒有事件' }
    }
    return { ok: true, multiple: false, events, name: baseName }
  } catch (err) {
    return { ok: false, reason: 'parse', message: err.message }
  }
}
