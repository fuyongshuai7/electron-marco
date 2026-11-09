<template>
  <div class="mini">
    <div class="mini-status">
      <span class="mini-dot" :class="dotClass"></span>
      <span class="mini-text">{{ statusText }}</span>
    </div>

    <div class="mini-actions">
      <button class="mini-btn" :class="{ active: state.recording }" :title="tip('startRecord')" @click="rec">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="6" fill="currentColor" />
        </svg>
      </button>
      <button class="mini-btn" :title="tip('stopRecord')" @click="stop">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      </button>
      <button class="mini-btn" :class="{ active: state.playing }" :title="state.playing ? tip('stopPlay') : tip('play')" @click="playToggle">
        <svg v-if="!state.playing" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      </button>
    </div>

    <span class="mini-divider"></span>

    <button class="mini-btn" :class="{ active: state.autoClickRunning }" :title="state.autoClickRunning ? tip('stopAutoClick') : tip('startAutoClick')" @click="clickToggle">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g transform="translate(3.5 5.5) scale(0.72)">
          <path fill="currentColor" d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74a2.5 2.5 0 0 1 5 0V14a6.5 6.5 0 1 1-13 0v-2.76a2.5 2.5 0 0 1 3 0z" />
        </g>
        <path d="M9 4a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <path d="M10.5 1.5a1.5 1.5 0 0 1 3 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.5" />
      </svg>
    </button>

    <span class="mini-divider"></span>

    <div class="mini-ctl">
      <button class="mini-btn pin" :class="{ active: state.pinned }" :title="state.pinned ? $t('mini.unpin') : $t('mini.pin')" @click="pin">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 4h6l-.5 6.5 3.5 3.5v1.5h-5.5V21h-1v-5.5H6v-1.5l3.5-3.5z" fill="currentColor" />
        </svg>
      </button>
      <button class="mini-btn expand" :title="expandTip" @click="expand">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 9l7-7 7 7M5 15l7 7 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { state } from '../store'

const { t } = useI18n()
const api = () => window.electronApi

const statusText = computed(() => {
  if (state.recording) return t('status.recording')
  if (state.countdown > 0) return t('status.playCountdown', { n: state.countdown })
  if (state.playing) return t('status.playing', { round: state.round, total: state.repeat || t('status.infinite') })
  if (state.autoClickRunning && state.autoClickCountdown > 0) return t('mini.countdown', { n: state.autoClickCountdown })
  if (state.autoClickRunning) return t('status.clicking')
  if (!state.hookReady) return t('status.hookNotReady')
  return t('status.idle')
})

const dotClass = computed(() => {
  if (!state.hookReady) return 'dot-error'
  if (state.recording) return 'dot-rec'
  if (state.playing || state.countdown > 0) return 'dot-play'
  if (state.autoClickRunning) return 'dot-click'
  return 'dot-idle'
})

const comboText = (combo) => {
  if (!combo) return ''
  const parts = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.alt) parts.push('Alt')
  if (combo.shift) parts.push('Shift')
  if (combo.meta) parts.push('Meta')
  parts.push(combo.key)
  return parts.join('+')
}

/** 按鈕提示：功能名（快捷鍵） */
const tip = (action) => {
  const name = t(`hotkeys.names.${action}`)
  const combo = comboText(state.settings?.hotkeys?.[action])
  return combo ? `${name}（${combo}）` : name
}

const expandTip = computed(() => {
  const combo = comboText(state.settings?.hotkeys?.toggleMini)
  return combo ? `${t('win.expand')}（${combo}）` : t('win.expand')
})

const rec = () => api()?.marco?.startRecord()
const stop = () => api()?.marco?.stopRecord()
const playToggle = () => (state.playing ? api()?.marco?.stopPlay() : api()?.marco?.play())
const clickToggle = () => (state.autoClickRunning ? api()?.autoClick?.stop() : api()?.autoClick?.start())
const pin = () => api()?.window?.togglePin()
const expand = () => api()?.window?.setMode('full')
</script>

<style scoped>
.mini {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: linear-gradient(180deg, #12162a, #0e1120);
  -webkit-app-region: drag;
  user-select: none;
}

.mini-status {
  flex: none;
  width: 104px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--text-dim);
  flex: none;
}

.mini-dot.dot-error {
  background: var(--danger);
}
.mini-dot.dot-rec {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(255, 93, 115, 0.2);
}
.mini-dot.dot-play {
  background: var(--accent-2);
  box-shadow: 0 0 0 3px rgba(70, 224, 200, 0.2);
}
.mini-dot.dot-click {
  background: var(--warn);
  box-shadow: 0 0 0 3px rgba(255, 180, 87, 0.2);
}
.mini-dot.dot-idle {
  background: var(--text-dim);
}

.mini-text {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-actions {
  display: flex;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
}

.mini-divider {
  width: 1px;
  height: 22px;
  background: var(--border);
  flex: none;
}

.mini-ctl {
  display: flex;
  gap: 4px;
  flex: none;
}

.mini-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.mini-btn svg {
  width: 16px;
  height: 16px;
}

.mini-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}

.mini-btn.active {
  color: #fff;
  background: rgba(109, 140, 255, 0.24);
}

.mini-btn.pin.active {
  color: var(--accent);
  background: rgba(109, 140, 255, 0.18);
}

.mini-btn.expand:hover {
  color: var(--accent-2);
  background: rgba(70, 224, 200, 0.12);
}
</style>
