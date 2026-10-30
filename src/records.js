import log from './core/logger'
import {
  loadRecords,
  saveRecords,
  saveRecordsSync,
  exportRecord,
  exportAllRecords,
  importRecord,
  openFolder,
  getFolderPath,
  setFolderPath,
} from './recordsStore'

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const parseSeq = (name) => {
  const m = /^錄製\s*(\d+)$/.exec(String(name || '').trim())
  return m ? Number(m[1]) : 0
}

export function createRecords(notify = () => {}, deps = {}) {
  const { onSelect = () => {} } = deps

  let items = []
  let selectedId = null
  let seq = 0
  let persistTimer = null
  let keepBackups = 3

  const durationOf = (events) => {
    if (!Array.isArray(events) || events.length < 2) return 0
    const first = events[0]?.time || 0
    const last = events[events.length - 1]?.time || 0
    return Math.max(0, last - first)
  }

  const toMeta = (r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    saved: !!r.saved,
    count: r.events.length,
    duration: durationOf(r.events),
  })

  const emit = () => {
    const payload = { items: items.map(toMeta), selectedId, folder: getFolderPath() }
    notify(payload)
    return payload
  }

  const find = (id) => items.find((r) => r.id === id)

  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(async () => {
      persistTimer = null
      try {
        await saveRecords(
          items.filter((r) => r.saved),
          keepBackups
        )
      } catch (err) {
        log.error('saveRecords failed', err)
      }
    }, 300)
  }

  const syncSelection = () => {
    const current = find(selectedId)
    onSelect(current ? current.events.slice() : [])
  }

  const touch = (r) => {
    r.updatedAt = Date.now()
  }

  function load() {
    return loadRecords().then((saved) => {
      items = saved.map((r) => ({ ...r, saved: true }))
      seq = items.reduce((max, r) => Math.max(max, parseSeq(r.name)), 0)
      selectedId = items.length ? items[0].id : null
      emit()
      syncSelection()
      return items
    })
  }

  // 錄製結束後加入臨時列表（尚未儲存到本機）
  function addFromRecording(events) {
    if (!Array.isArray(events) || events.length === 0) return null
    const now = Date.now()
    const rec = {
      id: uid(),
      name: `錄製 ${++seq}`,
      createdAt: now,
      updatedAt: now,
      saved: false,
      events: events.slice(),
    }
    items.push(rec)
    selectedId = rec.id
    emit()
    syncSelection()
    return rec
  }

  function addImported(events, name) {
    if (!Array.isArray(events) || events.length === 0) return null
    const now = Date.now()
    const rec = {
      id: uid(),
      name: name || `匯入 ${++seq}`,
      createdAt: now,
      updatedAt: now,
      saved: true,
      events: events.slice(),
    }
    items.push(rec)
    selectedId = rec.id
    emit()
    persist()
    syncSelection()
    return rec
  }

  function select(id) {
    if (!find(id)) return false
    selectedId = id
    emit()
    syncSelection()
    return true
  }

  function save(id) {
    const rec = find(id)
    if (!rec) return false
    rec.saved = true
    touch(rec)
    emit()
    persist()
    return true
  }

  function rename(id, name) {
    const rec = find(id)
    const next = String(name || '').trim()
    if (!rec || !next) return false
    rec.name = next
    touch(rec)
    emit()
    if (rec.saved) persist()
    return true
  }

  function moveTo(id, target) {
    const index = items.findIndex((r) => r.id === id)
    if (index < 0) return false
    const dest = Math.min(items.length - 1, Math.max(0, Number(target) || 0))
    if (dest === index) return false
    const [rec] = items.splice(index, 1)
    items.splice(dest, 0, rec)
    emit()
    persist()
    return true
  }

  function move(id, delta) {
    const index = items.findIndex((r) => r.id === id)
    if (index < 0) return false
    return moveTo(id, index + (Number(delta) || 0))
  }

  function duplicate(id) {
    const index = items.findIndex((r) => r.id === id)
    if (index < 0) return null
    const source = items[index]
    const now = Date.now()
    const rec = {
      id: uid(),
      name: `${source.name} 複本`,
      createdAt: now,
      updatedAt: now,
      saved: false,
      events: source.events.slice(),
    }
    items.splice(index + 1, 0, rec)
    selectedId = rec.id
    emit()
    syncSelection()
    return rec
  }

  /** 把多筆錄製依清單順序串成一筆，插入在最前面那一筆的位置 */
  function merge(ids) {
    const list = Array.isArray(ids) ? ids : []
    if (list.length < 2) return null
    const targets = list
      .map((id) => items.find((r) => r.id === id))
      .filter(Boolean)
    if (targets.length < 2) return null

    const events = []
    let cursor = 0
    targets.forEach((rec, i) => {
      const list = rec.events.slice()
      if (!list.length) return
      const head = list[0].time
      if (i > 0) cursor += 300 // 錄製之間補上一段間隔
      list.forEach((e) => {
        events.push({ ...e, time: cursor + (e.time - head) })
      })
      cursor += list[list.length - 1].time - head
    })
    if (!events.length) return null

    const now = Date.now()
    const firstIndex = items.findIndex((r) => r.id === targets[0].id)
    const rec = {
      id: uid(),
      name: `合併 ${targets.map((r) => r.name).join(' + ')}`,
      createdAt: now,
      updatedAt: now,
      saved: false,
      events,
    }
    for (const t of targets) {
      const idx = items.findIndex((r) => r.id === t.id)
      if (idx >= 0) items.splice(idx, 1)
    }
    items.splice(Math.max(0, Math.min(items.length, firstIndex)), 0, rec)
    selectedId = rec.id
    emit()
    syncSelection()
    return rec
  }

  /** 去掉開頭 / 結尾指定毫秒的事件 */
  function trimTime(id, { headMs = 0, tailMs = 0 } = {}) {
    const rec = find(id)
    if (!rec || !rec.events.length) return false
    const events = rec.events
    const first = events[0].time
    const last = events[events.length - 1].time
    const startAt = first + Math.max(0, Number(headMs) || 0)
    const endAt = last - Math.max(0, Number(tailMs) || 0)
    const kept = events.filter((e) => e.time >= startAt && e.time <= endAt)
    if (!kept.length) return false
    rec.events = kept
    touch(rec)
    emit()
    if (rec.saved) persist()
    syncSelection()
    return true
  }

  /** 從指定事件設為起點（丟棄前面的事件） */
  function trimBefore(id, index) {
    const rec = find(id)
    if (!rec) return false
    const at = Math.max(0, Math.min(rec.events.length - 1, Number(index) || 0))
    if (at === 0) return false
    rec.events = rec.events.slice(at)
    touch(rec)
    emit()
    if (rec.saved) persist()
    syncSelection()
    return true
  }

  /** 從指定事件起（含）之後全部丟棄 */
  function truncateAt(id, index) {
    const rec = find(id)
    if (!rec) return false
    const at = Math.max(0, Number(index) || 0)
    if (at >= rec.events.length) return false
    rec.events = rec.events.slice(0, at)
    touch(rec)
    emit()
    if (rec.saved) persist()
    syncSelection()
    return true
  }

  /** 刪除單一事件，並把後面的事件往前補上時間差 */
  function removeEvent(id, index) {
    const rec = find(id)
    if (!rec) return false
    const at = Number(index)
    if (!Number.isInteger(at) || at < 0 || at >= rec.events.length) return false
    rec.events.splice(at, 1)
    touch(rec)
    emit()
    if (rec.saved) persist()
    syncSelection()
    return true
  }

  /** 給事件檢視器用的輕量資料（限制筆數，避免清單過大拖垮渲染） */
  function listEvents(id, limit = 400) {
    const rec = find(id)
    if (!rec) return { events: [], total: 0, truncated: false }
    const first = rec.events[0]?.time || 0
    const list = rec.events.slice(0, limit).map((e, i) => ({
      index: i,
      kind: e.kind,
      offset: Math.max(0, (e.time || 0) - first),
      down: e.type === 4 || e.type === 7,
      keycode: e.keycode,
      button: e.button,
      x: e.x,
      y: e.y,
      amount: e.amount,
      rotation: e.rotation,
    }))
    return { events: list, total: rec.events.length, truncated: rec.events.length > limit }
  }

  function remove(id) {
    const index = items.findIndex((r) => r.id === id)
    if (index < 0) return false
    const [removed] = items.splice(index, 1)
    if (selectedId === id) {
      const next = items[Math.min(index, items.length - 1)]
      selectedId = next ? next.id : null
    }
    emit()
    if (removed.saved) persist()
    syncSelection()
    return true
  }

  function exportOne(parent, id) {
    const rec = find(id)
    if (!rec) return Promise.resolve({ ok: false, reason: 'missing' })
    return exportRecord(parent, rec).then(
      (result) => result,
      (err) => ({ ok: false, reason: 'write', message: err.message })
    )
  }

  function exportAll(parent) {
    return exportAllRecords(parent, items).then(
      (result) => result,
      (err) => ({ ok: false, reason: 'write', message: err.message })
    )
  }

  function importOne(parent) {
    return importRecord(parent).then((result) => {
      if (!result.ok) return result
      if (result.multiple) {
        const added = result.list.map((entry) => addImported(entry.events, entry.name))
        const total = added.reduce((sum, rec) => sum + (rec ? rec.events.length : 0), 0)
        return { ok: true, multiple: true, count: added.filter(Boolean).length, events: total }
      }
      const rec = addImported(result.events, result.name)
      return { ok: !!rec, multiple: false, count: 1, events: result.events.length, name: rec?.name }
    })
  }

  function flush() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    return saveRecordsSync(
      items.filter((r) => r.saved),
      keepBackups
    )
  }

  function hasUnsaved() {
    return items.filter((r) => !r.saved).length
  }

  function saveAll() {
    const pending = items.filter((r) => !r.saved)
    if (!pending.length) return 0
    pending.forEach((r) => {
      r.saved = true
      touch(r)
    })
    emit()
    persist()
    return pending.length
  }

  /** 套用設定：資料目錄與備份份數 */
  function configure(options = {}) {
    if (typeof options.folder === 'string') setFolderPath(options.folder)
    if (options.keepBackups !== undefined) keepBackups = Math.max(0, Math.min(10, Number(options.keepBackups) || 0))
    return getFolderPath()
  }

  return {
    load,
    flush,
    configure,
    hasUnsaved,
    saveAll,
    addFromRecording,
    select,
    save,
    rename,
    move,
    moveTo,
    duplicate,
    merge,
    trimTime,
    trimBefore,
    truncateAt,
    removeEvent,
    listEvents,
    remove,
    exportOne,
    exportAll,
    importOne,
    openFolder: () => openFolder(),
    getSelectedEvents: () => {
      const rec = find(selectedId)
      return rec ? rec.events.slice() : []
    },
    emit,
  }
}
