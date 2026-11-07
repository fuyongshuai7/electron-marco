<template>
  <transition name="dialog">
    <div v-if="d.open" class="dialog-overlay" @click.self="choose(d.cancelId)">
      <div class="dialog-card" role="dialog" aria-modal="true">
        <div class="dialog-head">
          <span class="dialog-icon" :class="`icon-${d.kind}`">
            <svg v-if="d.kind === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l9 17H3L12 3z" />
              <path d="M12 10v4" />
              <path d="M12 17.5v.01" />
            </svg>
            <svg v-else-if="d.kind === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.01" />
            </svg>
          </span>
          <h3 class="dialog-title">{{ d.title }}</h3>
        </div>

        <div class="dialog-body">
          <p class="dialog-message">{{ d.message }}</p>
          <p v-if="d.detail" class="dialog-detail">{{ d.detail }}</p>
        </div>

        <div class="dialog-actions">
          <button
            v-for="(btn, i) in d.buttons"
            :key="i"
            class="btn dialog-btn"
            :class="`btn-${btn.kind || 'ghost'}`"
            :autofocus="i === d.defaultId"
            @click="choose(i)"
          >
            {{ btn.label }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { state } from '../store'

const d = computed(() => state.dialog)

const choose = (index) => {
  if (!state.dialog.open) return
  const id = state.dialog.id
  const i = Number.isInteger(index) ? index : state.dialog.cancelId
  state.dialog.open = false
  window.electronApi?.dialog?.answer(id, i)
}

const onKey = (e) => {
  if (!state.dialog.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    choose(state.dialog.cancelId)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose(state.dialog.defaultId)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  const off = window.electronApi?.dialog?.onAsk?.((payload) => {
    if (!payload) return
    state.dialog = {
      open: true,
      id: payload.id,
      kind: payload.kind || 'info',
      title: payload.title || '',
      message: payload.message || '',
      detail: payload.detail || '',
      buttons: Array.isArray(payload.buttons)
        ? payload.buttons.map((b) => (typeof b === 'string' ? { label: b, kind: 'ghost' } : b))
        : [],
      defaultId: Number.isInteger(payload.defaultId) ? payload.defaultId : 0,
      cancelId: Number.isInteger(payload.cancelId) ? payload.cancelId : 0,
    }
  })
  if (off) onBeforeUnmount(off)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgba(4, 6, 14, 0.62);
  backdrop-filter: blur(8px);
  animation: fade 0.16s ease;
}

.dialog-card {
  width: min(420px, calc(100vw - 48px));
  padding: 22px 24px 20px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(30, 34, 56, 0.98), rgba(18, 21, 38, 0.98));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.dialog-icon {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 10px;
}

.dialog-icon svg {
  width: 20px;
  height: 20px;
}

.icon-warning {
  color: var(--warn);
  background: rgba(255, 180, 87, 0.14);
}

.icon-error {
  color: var(--danger);
  background: rgba(255, 93, 115, 0.14);
}

.icon-info {
  color: var(--accent);
  background: rgba(109, 140, 255, 0.14);
}

.dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.dialog-body {
  margin-bottom: 20px;
}

.dialog-message {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
}

.dialog-detail {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  min-width: 84px;
  text-align: center;
}

@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-enter-active {
  animation: fade 0.16s ease;
}

.dialog-enter-active .dialog-card {
  animation: pop 0.18s ease;
}

.dialog-leave-active {
  animation: fade 0.12s ease reverse;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
