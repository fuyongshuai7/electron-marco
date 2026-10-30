<template>
  <section class="view">
    <header class="view-header">
      <h1>自動連點</h1>
      <p>設定點擊間隔與按鍵，在指定位置連續點擊。</p>
    </header>

    <div class="panel">
      <h2 class="panel-title">連點設定</h2>

      <div class="field">
        <label>點擊間隔（毫秒）</label>
        <div class="stepper" :class="{ disabled: state.autoClickRunning }">
          <input
            v-model.number="form.interval"
            type="number"
            min="10"
            step="10"
            :disabled="state.autoClickRunning"
            @change="sync"
            @blur="sync"
          />
          <div class="stepper-actions">
            <button type="button" :disabled="state.autoClickRunning" aria-label="增加" @click="stepBy(10)">
              <svg viewBox="0 0 10 6" aria-hidden="true">
                <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button type="button" :disabled="state.autoClickRunning" aria-label="減少" @click="stepBy(-10)">
              <svg viewBox="0 0 10 6" aria-hidden="true">
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="field">
        <label>時間抖動（%）</label>
        <div class="row">
          <input v-model.number="form.jitter" class="range" type="range" min="0" max="80" step="1" @change="sync" />
          <span class="range-value">{{ form.jitter }}%</span>
        </div>
        <p class="hint">每次點擊的間隔會隨機加減這個比例，避免節奏完全一致。</p>
      </div>

      <div class="field">
        <label>滑鼠按鍵</label>
        <div class="segmented">
          <button
            v-for="b in buttons"
            :key="b.value"
            class="seg-item"
            :class="{ active: form.button === b.value }"
            :disabled="state.autoClickRunning"
            @click="setButton(b.value)"
          >
            {{ b.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <label>按住時長（毫秒）</label>
        <div class="row">
          <input
            v-model.number="form.pressDuration"
            class="num-input"
            type="number"
            min="0"
            max="5000"
            step="10"
            @change="sync"
          />
          <span class="hint-inline">設為 0 表示按下後立即放開</span>
        </div>
      </div>

      <div class="field">
        <label class="switch">
          <input type="checkbox" v-model="form.double" @change="sync" />
          <span class="switch-track"></span>
          <span class="switch-label">雙擊模式</span>
        </label>
        <p class="hint">勾選後每次觸發為一次雙擊（此時「按住時長」不適用）。</p>
      </div>

      <div class="field">
        <label>點擊位置</label>
        <div class="segmented">
          <button class="seg-item" :class="{ active: form.mode === 'cursor' }" :disabled="state.autoClickRunning" @click="setMode('cursor')">
            滑鼠目前位置
          </button>
          <button class="seg-item" :class="{ active: form.mode === 'fixed' }" :disabled="state.autoClickRunning" @click="setMode('fixed')">
            固定座標
          </button>
        </div>

        <div v-if="form.mode === 'fixed'" class="row coord-row">
          <span class="coord">X {{ form.x }} · Y {{ form.y }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="state.autoClickRunning || picking" @click="pickPosition">
            {{ picking ? `放開滑鼠… ${pickLeft}s` : '取用目前位置' }}
          </button>
        </div>
      </div>

      <div class="field">
        <label>停止條件（皆為 0 表示不限制）</label>
        <div class="row wrap">
          <span class="mini-label">點擊次數</span>
          <input v-model.number="form.maxClicks" class="num-input" type="number" min="0" step="1" @change="sync" />
          <span class="mini-label">持續時間（毫秒）</span>
          <input v-model.number="form.maxDurationMs" class="num-input wide" type="number" min="0" step="1000" @change="sync" />
        </div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="state.autoClickRunning" @click="start">開始連點</button>
        <button class="btn btn-danger" :disabled="!state.autoClickRunning" @click="stop">停止連點</button>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel-title">快捷鍵</h2>
      <ul class="hotkey-list">
        <li>
          <kbd class="kbd-wide">{{ comboOf('startAutoClick') }}</kbd>
          <div class="hotkey-info">
            <span class="hotkey-name">開始連點</span>
            <span class="hotkey-desc">以目前設定的間隔與按鍵啟動</span>
          </div>
          <button class="btn btn-ghost" :disabled="state.autoClickRunning" @click="start">開始</button>
        </li>
        <li>
          <kbd class="kbd-wide">{{ comboOf('stopAutoClick') }}</kbd>
          <div class="hotkey-info">
            <span class="hotkey-name">停止連點</span>
            <span class="hotkey-desc">立即中斷目前連點</span>
          </div>
          <button class="btn btn-ghost btn-danger" :disabled="!state.autoClickRunning" @click="stop">停止</button>
        </li>
      </ul>
    </div>

    <div class="panel status">
      <span class="dot" :class="state.autoClickRunning ? 'dot-click' : 'dot-idle'"></span>
      <span>
        {{
          state.autoClickRunning
            ? `連點中 · 每 ${form.interval} ms 點擊一次 · 已點擊 ${state.autoClickClicked} 次`
            : stopReasonText || '未啟動'
        }}
      </span>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { state } from '../store'

const form = reactive({
  interval: 100,
  button: 'left',
  jitter: 0,
  pressDuration: 0,
  double: false,
  mode: 'cursor',
  x: 0,
  y: 0,
  maxClicks: 0,
  maxDurationMs: 0,
})

watch(
  () => state.settings?.autoClick,
  (opts) => {
    if (!opts) return
    Object.assign(form, opts)
  },
  { immediate: true }
)

const buttons = [
  { label: '左鍵', value: 'left' },
  { label: '右鍵', value: 'right' },
  { label: '中鍵', value: 'middle' },
]

const api = () => window.electronApi?.autoClick

const sync = () => {
  const patch = {
    interval: Math.min(3600000, Math.max(10, Math.round(Number(form.interval) || 100))),
    button: form.button,
    jitter: Math.min(80, Math.max(0, Number(form.jitter) || 0)),
    pressDuration: Math.min(5000, Math.max(0, Math.round(Number(form.pressDuration) || 0))),
    double: !!form.double,
    mode: form.mode === 'fixed' ? 'fixed' : 'cursor',
    x: Math.round(Number(form.x) || 0),
    y: Math.round(Number(form.y) || 0),
    maxClicks: Math.max(0, Math.round(Number(form.maxClicks) || 0)),
    maxDurationMs: Math.max(0, Math.round(Number(form.maxDurationMs) || 0)),
  }
  Object.assign(form, patch)
  api()?.configure?.(patch)
}

const setButton = (v) => {
  form.button = v
  sync()
}

const setMode = (v) => {
  form.mode = v
  sync()
}

const stepBy = (delta) => {
  form.interval = Math.max(10, (Number(form.interval) || 0) + delta)
  sync()
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

const comboOf = (action) => comboText(state.settings?.hotkeys?.[action])

const stopReasonText = computed(() => {
  switch (state.autoClickReason) {
    case 'clicks':
      return '已達到點擊次數上限'
    case 'duration':
      return '已達到持續時間上限'
    case 'error':
      return '執行失敗並已停止'
    default:
      return ''
  }
})

/* ---------- 取用目前滑鼠位置 ---------- */
const picking = ref(false)
const pickLeft = ref(0)
let pickTimer = null

const pickPosition = async () => {
  if (picking.value) return
  picking.value = true
  pickLeft.value = 3
  pickTimer = setInterval(async () => {
    pickLeft.value -= 1
    if (pickLeft.value > 0) return
    clearInterval(pickTimer)
    pickTimer = null
    picking.value = false
    const pos = await api()?.getPosition?.()
    if (pos) {
      form.x = pos.x
      form.y = pos.y
      sync()
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (pickTimer) clearInterval(pickTimer)
})

const start = () => {
  sync()
  api()?.start?.({ ...form })
}

const stop = () => api()?.stop?.()
</script>

<style scoped>
.field {
  margin-bottom: 20px;
}

.field > label:not(.switch) {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.row.wrap {
  flex-wrap: wrap;
}

.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-dim);
}

.hint-inline {
  font-size: 11px;
  color: var(--text-dim);
}

.mini-label {
  font-size: 12px;
  color: var(--text-dim);
}

.num-input {
  width: 110px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 13px;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.num-input.wide {
  width: 150px;
}

.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.range {
  width: 160px;
  accent-color: var(--accent);
}

.range-value {
  min-width: 44px;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.coord-row {
  margin-top: 10px;
}

.coord {
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.stepper {
  display: inline-flex;
  align-items: stretch;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.stepper:focus-within {
  border-color: var(--accent);
}

.stepper.disabled {
  opacity: 0.5;
}

.stepper input {
  width: 110px;
  padding: 0 0 0 14px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.stepper input::-webkit-outer-spin-button,
.stepper input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-actions {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
}

.stepper-actions button {
  flex: 1;
  width: 30px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.stepper-actions button svg {
  width: 10px;
  height: 6px;
}

.stepper-actions button + button {
  border-top: 1px solid var(--border);
}

.stepper-actions button:hover:not(:disabled) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.1);
}

.stepper-actions button:disabled {
  cursor: not-allowed;
}

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

.seg-item:hover:not(:disabled) {
  color: var(--text);
}

.seg-item.active {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), #8f7bff);
}

.seg-item:disabled {
  cursor: not-allowed;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
}

.switch input {
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

.switch input:checked + .switch-track {
  background: var(--accent);
}

.switch input:checked + .switch-track::after {
  transform: translateX(20px);
}

.switch-label {
  font-size: 14px;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
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

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-dim);
  margin-top: 22px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-idle {
  background: var(--text-dim);
}

.dot-click {
  background: var(--warn);
  box-shadow: 0 0 0 4px rgba(255, 180, 87, 0.18);
  animation: pulse 1.4s infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
