<template>
  <section class="view">
    <header class="view-header">
      <h1>設定</h1>
      <p>快捷鍵、錄製行為與資料存放位置。</p>
    </header>

    <div class="panel">
      <h2 class="panel-title">全域快捷鍵</h2>
      <p class="panel-desc">
        全部採用組合鍵，避免與其他軟體搶用單一功能鍵。點「錄製」後直接按下你要的組合鍵即可。
      </p>
      <ul class="hotkey-list">
        <li v-for="h in rows" :key="h.action">
          <kbd class="kbd-wide">{{ h.label }}</kbd>
          <div class="hotkey-info">
            <span class="hotkey-name">{{ h.name }}</span>
            <span class="hotkey-desc">{{ h.desc }}</span>
          </div>
          <div class="hotkey-actions">
            <button
              class="btn btn-ghost btn-sm"
              @click="toggleCapture(h.action)"
            >
              {{ capturing === h.action ? '按下組合鍵…（點此取消）' : '錄製' }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="resetOne(h.action)">預設</button>
          </div>
        </li>
      </ul>
      <p v-if="msg" class="storage-msg" :class="msgKind">{{ msg }}</p>
    </div>

    <div class="panel">
      <h2 class="panel-title">錄製行為</h2>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.recording?.captureMouseMove"
          @change="update({ recording: { captureMouseMove: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">錄製滑鼠移動軌跡</span>
      </label>
      <p class="hint">
        開啟後才能回放拖曳、繪圖等操作，但事件數量會大幅增加。建議搭配下方的取樣設定控制檔案大小。
      </p>

      <div class="grid">
        <label class="field-inline">
          <span>取樣間隔（毫秒）</span>
          <input
            class="num-input"
            type="number"
            min="5"
            max="500"
            step="5"
            :value="settings.recording?.moveThrottleMs"
            @change="update({ recording: { moveThrottleMs: Number($event.target.value) } })"
          />
        </label>
        <label class="field-inline">
          <span>最小位移（像素）</span>
          <input
            class="num-input"
            type="number"
            min="0"
            max="200"
            step="1"
            :value="settings.recording?.moveMinDistance"
            @change="update({ recording: { moveMinDistance: Number($event.target.value) } })"
          />
        </label>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel-title">資料存放</h2>
      <p class="folder-path">{{ state.folderPath || '（尚未載入）' }}</p>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" @click="pick">選擇資料夾</button>
        <button class="btn btn-ghost btn-sm" @click="useDefault">回復預設位置</button>
        <button class="btn btn-ghost btn-sm" @click="openRecords">開啟資料夾</button>
        <button class="btn btn-ghost btn-sm" @click="openLogs">開啟日誌</button>
      </div>
      <label class="field-inline spaced">
        <span>保留備份份數</span>
        <input
          class="num-input"
          type="number"
          min="0"
          max="10"
          step="1"
          :value="settings.persist?.keepBackups"
          @change="update({ persist: { keepBackups: Number($event.target.value) } })"
        />
      </label>
      <p class="hint">每次寫入 records.json 前會輪替備份（records.json.bak.1 起）。</p>
    </div>

    <div class="panel">
      <h2 class="panel-title">程式行為</h2>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.window?.closeToTray"
          @change="update({ window: { closeToTray: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">關閉視窗時縮到托盤</span>
      </label>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.window?.launchAtLogin"
          @change="update({ window: { launchAtLogin: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">開機自動啟動</span>
      </label>
      <p class="hint">托盤圖示可顯示目前狀態，並提供「緊急停止」與顯示 / 隱藏視窗。</p>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" @click="hideWindow">隱藏到托盤</button>
        <button class="btn btn-danger btn-sm" @click="doReset">還原全部設定</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { state } from '../store'

const api = () => window.electronApi

const settings = computed(() => state.settings || {})

const HOTKEY_DEFS = [
  { action: 'startRecord', name: '開始錄製', desc: '清空舊記錄並開始捕捉鍵鼠操作' },
  { action: 'stopRecord', name: '停止錄製', desc: '結束錄製並加入已錄製清單' },
  { action: 'play', name: '回放', desc: '依回放設定重播目前選取的錄製' },
  { action: 'stopPlay', name: '停止回放', desc: '中斷回放並放開所有按住的鍵' },
  { action: 'startAutoClick', name: '開始連點', desc: '以連點頁設定啟動' },
  { action: 'stopAutoClick', name: '停止連點', desc: '立即中斷連點' },
  { action: 'emergencyStop', name: '緊急停止', desc: '一次停止錄製 / 回放 / 連點，且不保留本次錄製' },
]

const DEFAULT_COMBOS = {
  startRecord: ['Ctrl', 'Alt', 'F6'],
  stopRecord: ['Ctrl', 'Alt', 'F7'],
  play: ['Ctrl', 'Alt', 'F8'],
  stopPlay: ['Ctrl', 'Alt', 'F9'],
  startAutoClick: ['Ctrl', 'Alt', 'F10'],
  stopAutoClick: ['Ctrl', 'Alt', 'F11'],
  emergencyStop: ['Ctrl', 'Alt', 'F12'],
}

const comboText = (combo) => {
  if (!combo) return '未設定'
  const parts = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.alt) parts.push('Alt')
  if (combo.shift) parts.push('Shift')
  if (combo.meta) parts.push('Meta')
  parts.push(combo.key)
  return parts.join('+')
}

const rows = computed(() =>
  HOTKEY_DEFS.map((h) => ({
    ...h,
    label: comboText(settings.value.hotkeys?.[h.action]),
  }))
)

const capturing = ref(null)
const msg = ref('')
const msgKind = ref('info')

const setMsg = (text, kind = 'info', timeout = 4000) => {
  msg.value = text
  msgKind.value = kind
  if (timeout) {
    setTimeout(() => {
      if (msg.value === text) msg.value = ''
    }, timeout)
  }
}

let unsubscribe = null
const ensureListener = () => {
  if (unsubscribe) return unsubscribe
  unsubscribe = api()?.hotkeys?.onCaptured?.((payload) => {
    capturing.value = null
    if (payload?.label) setMsg(`已設定為 ${payload.label}`, 'success')
  })
  return unsubscribe
}

const toggleCapture = async (action) => {
  ensureListener()
  if (capturing.value === action) {
    await api()?.hotkeys?.cancelCapture?.()
    capturing.value = null
    return
  }
  capturing.value = action
  const ok = await api()?.hotkeys?.capture?.(action)
  if (!ok) capturing.value = null
}

const resetOne = async (action) => {
  const parts = DEFAULT_COMBOS[action] || []
  const combo = {
    ctrl: parts.includes('Ctrl'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    meta: parts.includes('Meta'),
    key: parts[parts.length - 1],
  }
  await api()?.hotkeys?.set?.(action, combo)
  setMsg('已還原為預設組合鍵', 'success')
}

const update = async (patch) => {
  await api()?.settings?.update?.(patch)
}

const pick = async () => {
  await api()?.app?.pickFolder?.()
}

const useDefault = async () => {
  await api()?.settings?.update?.({ persist: { folder: '' } })
  setMsg('已回復預設資料夾', 'success')
}

const openRecords = () => api()?.app?.openFolder?.('records')
const openLogs = () => api()?.app?.openFolder?.('logs')
const hideWindow = () => api()?.window?.hide?.()

const doReset = async () => {
  await api()?.settings?.reset?.()
  setMsg('設定已還原', 'success')
}

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.hotkey-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hotkey-list li {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 4px;
  border-top: 1px solid var(--border);
}

.hotkey-list li:first-child {
  border-top: 0;
}

.kbd-wide {
  min-width: 132px;
}

.hotkey-info {
  flex: 1;
  min-width: 0;
}

.hotkey-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
}

.hotkey-desc {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}

.hotkey-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.panel-desc {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.7;
}

.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.6;
}

.switch-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 10px;
}

.switch-row input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  position: relative;
  flex: none;
  transition: background 0.2s ease;
}

.switch-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.switch-row input:checked + .switch-track {
  background: var(--accent);
}

.switch-row input:checked + .switch-track::after {
  transform: translateX(20px);
}

.switch-label {
  font-size: 14px;
  font-weight: 500;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 26px;
  margin-top: 14px;
}

.field-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.field-inline.spaced {
  margin-top: 14px;
}

.num-input {
  width: 96px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 12px;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.folder-path {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--text-dim);
  word-break: break-all;
}

.storage-msg {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}

.storage-msg.success {
  color: var(--accent-2);
}

.storage-msg.warn {
  color: var(--warn);
}

.storage-msg.error {
  color: var(--danger);
}
</style>
