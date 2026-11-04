<template>
  <section class="view">
    <header class="view-header">
      <h1>{{ $t('settings.title') }}</h1>
      <p>{{ $t('settings.subtitle') }}</p>
    </header>

    <div class="panel">
      <h2 class="panel-title">{{ $t('settings.language') }}</h2>
      <div class="segmented">
        <button
          v-for="l in locales"
          :key="l.value"
          class="seg-item"
          :class="{ active: currentLocale === l.value }"
          @click="changeLocale(l.value)"
        >
          {{ l.label }}
        </button>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel-title">{{ $t('settings.hotkeysTitle') }}</h2>
      <p class="panel-desc">{{ $t('settings.hotkeysDesc') }}</p>
      <ul class="hotkey-list">
        <li v-for="h in rows" :key="h.action">
          <kbd class="kbd-wide">{{ h.label }}</kbd>
          <div class="hotkey-info">
            <span class="hotkey-name">{{ h.name }}</span>
            <span class="hotkey-desc">{{ h.desc }}</span>
          </div>
          <div class="hotkey-actions">
            <button class="btn btn-ghost btn-sm" @click="toggleCapture(h.action)">
              {{ capturing === h.action ? $t('settings.capturing') : $t('settings.captureBtn') }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="resetOne(h.action)">{{ $t('settings.resetBtn') }}</button>
          </div>
        </li>
      </ul>
      <p v-if="msg" class="storage-msg" :class="msgKind">{{ msg }}</p>
    </div>

    <div class="panel">
      <h2 class="panel-title">{{ $t('settings.recordingTitle') }}</h2>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.recording?.captureMouseMove"
          @change="update({ recording: { captureMouseMove: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">{{ $t('settings.captureMove') }}</span>
      </label>
      <p class="hint">{{ $t('settings.captureHint') }}</p>

      <div class="grid">
        <label class="field-inline">
          <span>{{ $t('settings.throttle') }}</span>
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
          <span>{{ $t('settings.minDist') }}</span>
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
      <h2 class="panel-title">{{ $t('settings.dataTitle') }}</h2>
      <p class="folder-path">{{ state.folderPath || $t('settings.noFolder') }}</p>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" @click="pick">{{ $t('settings.pickFolder') }}</button>
        <button class="btn btn-ghost btn-sm" @click="useDefault">{{ $t('settings.useDefault') }}</button>
        <button class="btn btn-ghost btn-sm" @click="openRecords">{{ $t('settings.openData') }}</button>
        <button class="btn btn-ghost btn-sm" @click="openLogs">{{ $t('settings.openLogs') }}</button>
      </div>
      <label class="field-inline spaced">
        <span>{{ $t('settings.keepBackups') }}</span>
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
      <p class="hint">{{ $t('settings.backupHint') }}</p>
    </div>

    <div class="panel">
      <h2 class="panel-title">{{ $t('settings.behaviorTitle') }}</h2>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.window?.closeToTray"
          @change="update({ window: { closeToTray: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">{{ $t('settings.closeToTray') }}</span>
      </label>
      <label class="switch-row">
        <input
          type="checkbox"
          :checked="!!settings.window?.launchAtLogin"
          @change="update({ window: { launchAtLogin: $event.target.checked } })"
        />
        <span class="switch-track"></span>
        <span class="switch-label">{{ $t('settings.launchAtLogin') }}</span>
      </label>
      <p class="hint">{{ $t('settings.trayHint') }}</p>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" @click="hideWindow">{{ $t('settings.hideToTray') }}</button>
        <button class="btn btn-danger btn-sm" @click="doReset">{{ $t('settings.resetAll') }}</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { state } from '../store'
import { LOCALES } from '../i18n'

const { t, locale } = useI18n()

const api = () => window.electronApi

const locales = LOCALES
const currentLocale = computed(() => locale.value)

const changeLocale = (value) => {
  if (value === locale.value) return
  api()?.settings?.update?.({ ui: { locale: value } })
}

const settings = computed(() => state.settings || {})

const HOTKEY_ACTIONS = [
  'startRecord',
  'stopRecord',
  'play',
  'stopPlay',
  'startAutoClick',
  'stopAutoClick',
  'emergencyStop',
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
  if (!combo) return t('hotkeys.notSet')
  const parts = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.alt) parts.push('Alt')
  if (combo.shift) parts.push('Shift')
  if (combo.meta) parts.push('Meta')
  parts.push(combo.key)
  return parts.join('+')
}

const rows = computed(() =>
  HOTKEY_ACTIONS.map((action) => ({
    action,
    label: comboText(settings.value.hotkeys?.[action]),
    name: t(`hotkeys.names.${action}`),
    desc: t(`hotkeys.descs.${action}`),
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
    if (payload?.label) setMsg(t('settings.msgCaptured', { label: payload.label }), 'success')
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
  setMsg(t('settings.msgHotkeyReset'), 'success')
}

const update = async (patch) => {
  await api()?.settings?.update?.(patch)
}

const pick = async () => {
  await api()?.app?.pickFolder?.()
}

const useDefault = async () => {
  await api()?.settings?.update?.({ persist: { folder: '' } })
  setMsg(t('settings.msgDefaultFolder'), 'success')
}

const openRecords = () => api()?.app?.openFolder?.('records')
const openLogs = () => api()?.app?.openFolder?.('logs')
const hideWindow = () => api()?.window?.hide?.()

const doReset = async () => {
  await api()?.settings?.reset?.()
  setMsg(t('settings.msgReset'), 'success')
}

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.segmented {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
}

.seg-item {
  padding: 7px 18px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.seg-item:hover {
  color: var(--text);
}

.seg-item.active {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), #8f7bff);
}

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
