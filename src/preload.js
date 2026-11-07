import { contextBridge, ipcRenderer } from 'electron'

// IPC 白名單：渲染端只能呼叫這裡列舉的通道，避免被惡意頁面濫用
const INVOKE_CHANNELS = new Set([
  'settings:get',
  'settings:update',
  'settings:reset',
  'hotkeys:capture-start',
  'hotkeys:capture-cancel',
  'hotkeys:set',
  'marco:set-options',
  'autoclick:configure',
  'autoclick:start',
  'autoclick:stop',
  'autoclick:get-pos',
  'records:get',
  'records:select',
  'records:save',
  'records:save-all',
  'records:has-unsaved',
  'records:rename',
  'records:move',
  'records:move-to',
  'records:duplicate',
  'records:merge',
  'records:trim',
  'records:trim-before',
  'records:truncate-at',
  'records:remove-event',
  'records:list-events',
  'records:remove',
  'records:clear',
  'records:export',
  'records:export-all',
  'records:import',
  'records:open-folder',
  'app:pick-folder',
  'app:open-folder',
  'app:get-version',
  'dialog:answer',
])

const SEND_CHANNELS = new Set(['window:minimize', 'window:hide', 'window:toggle', 'window:close', 'app:quit'])

const listenChannels = new Set([
  'marco:status',
  'autoclick:status',
  'records:changed',
  'settings:changed',
  'hotkeys:captured',
  'hook:status',
  'dialog:ask',
])

const subscribe = (channel, callback) => {
  if (!listenChannels.has(channel)) throw new Error(`channel not allowed: ${channel}`)
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const invokeSafe = (channel, ...args) => {
  if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`channel not allowed: ${channel}`))
  return ipcRenderer.invoke(channel, ...args)
}

const sendSafe = (channel) => {
  if (!SEND_CHANNELS.has(channel)) return
  ipcRenderer.send(channel)
}

contextBridge.exposeInMainWorld('electronApi', {
  settings: {
    get: () => invokeSafe('settings:get'),
    update: (patch) => invokeSafe('settings:update', patch),
    reset: () => invokeSafe('settings:reset'),
    onChange: (cb) => subscribe('settings:changed', cb),
  },
  hotkeys: {
    capture: (action) => invokeSafe('hotkeys:capture-start', action),
    cancelCapture: () => invokeSafe('hotkeys:capture-cancel'),
    set: (action, combo) => invokeSafe('hotkeys:set', action, combo),
    onCaptured: (cb) => subscribe('hotkeys:captured', cb),
  },
  marco: {
    onStatus: (cb) => subscribe('marco:status', cb),
    setOptions: (patch) => invokeSafe('marco:set-options', patch),
  },
  window: {
    minimize: () => sendSafe('window:minimize'),
    hide: () => sendSafe('window:hide'),
    toggle: () => sendSafe('window:toggle'),
    close: () => sendSafe('window:close'),
  },
  app: {
    quit: () => sendSafe('app:quit'),
    pickFolder: () => invokeSafe('app:pick-folder'),
    openFolder: (target) => invokeSafe('app:open-folder', target),
    getVersion: () => invokeSafe('app:get-version'),
    onHookStatus: (cb) => subscribe('hook:status', cb),
  },
  records: {
    get: () => invokeSafe('records:get'),
    select: (id) => invokeSafe('records:select', id),
    save: (id) => invokeSafe('records:save', id),
    saveAll: () => invokeSafe('records:save-all'),
    hasUnsaved: () => invokeSafe('records:has-unsaved'),
    rename: (id, name) => invokeSafe('records:rename', id, name),
    move: (id, delta) => invokeSafe('records:move', id, delta),
    moveTo: (id, index) => invokeSafe('records:move-to', id, index),
    duplicate: (id) => invokeSafe('records:duplicate', id),
    merge: (ids) => invokeSafe('records:merge', ids),
    trim: (id, opts) => invokeSafe('records:trim', id, opts),
    trimBefore: (id, index) => invokeSafe('records:trim-before', id, index),
    truncateAt: (id, index) => invokeSafe('records:truncate-at', id, index),
    removeEvent: (id, index) => invokeSafe('records:remove-event', id, index),
    listEvents: (id) => invokeSafe('records:list-events', id),
    remove: (id) => invokeSafe('records:remove', id),
    clear: () => invokeSafe('records:clear'),
    export: (id) => invokeSafe('records:export', id),
    exportAll: () => invokeSafe('records:export-all'),
    import: () => invokeSafe('records:import'),
    openFolder: () => invokeSafe('records:open-folder'),
    onChanged: (cb) => subscribe('records:changed', cb),
  },
  autoClick: {
    configure: (options) => invokeSafe('autoclick:configure', options),
    start: (options) => invokeSafe('autoclick:start', options),
    stop: () => invokeSafe('autoclick:stop'),
    getPosition: () => invokeSafe('autoclick:get-pos'),
    onStatus: (cb) => subscribe('autoclick:status', cb),
  },
  dialog: {
    onAsk: (cb) => subscribe('dialog:ask', cb),
    answer: (id, index) => invokeSafe('dialog:answer', id, index),
  },
})
