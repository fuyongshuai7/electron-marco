<template>
  <MiniView v-if="state.mode === 'mini'" />

  <div v-else class="window">
    <header class="titlebar">
      <div class="titlebar-brand">
        <div class="brand-logo">M</div>
        <div class="brand-text">
          <span class="brand-name">Marco</span>
          <span class="brand-sub">{{ $t('app.tagline') }}</span>
        </div>
      </div>

      <div class="window-controls">
        <button class="win-btn" :title="$t('win.mini')" @click="toMini">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M4 8L2 10M2 7v3h3M8 4l2-2M10 5V2H7"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button class="win-btn" :title="$t('win.minimize')" @click="minimize">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
        <button class="win-btn win-close" :title="$t('win.close')" @click="close">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </header>

    <div class="app">
      <aside class="sidebar">
        <nav class="nav">
          <button
            v-for="item in menus"
            :key="item.key"
            class="nav-item"
            :class="{ active: state.activeMenu === item.key }"
            @click="state.activeMenu = item.key"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- 內建 SVG 圖示常數，非使用者輸入 -->
            <span class="nav-icon" v-html="item.icon"></span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <span class="dot" :class="dotClass"></span>
          <span class="footer-text">{{ statusText }}</span>
          <span v-if="state.appVersion" class="footer-version">v{{ state.appVersion }}</span>
        </div>
      </aside>

      <main ref="mainEl" class="main" :class="{ 'is-scrolling': scrolling }">
        <RecordView v-show="state.activeMenu === 'record'" />
        <AutoClickView v-show="state.activeMenu === 'autoclick'" />
        <SettingsView v-show="state.activeMenu === 'settings'" />
      </main>
    </div>
  </div>

  <ConfirmDialog />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RecordView from './views/RecordView.vue'
import AutoClickView from './views/AutoClickView.vue'
import SettingsView from './views/SettingsView.vue'
import MiniView from './views/MiniView.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { state } from './store'
import { applyLocale } from './i18n'

const { t } = useI18n()

const menuIcons = {
  record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>`,
  autoclick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v7l-2 3h4l1 6"/><path d="M14 4v6h2a2 2 0 0 1 0 4h-2l1 6"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.5 1.5M16 16l1.5 1.5M17.5 6.5L16 8M8 16l-1.5 1.5"/></svg>`,
}

const menus = computed(() =>
  ['record', 'autoclick', 'settings'].map((key) => ({
    key,
    label: t(`menu.${key}`),
    icon: menuIcons[key],
  }))
)

const statusText = computed(() => {
  if (state.recording) return t('status.recording')
  if (state.countdown > 0) return t('status.playCountdown', { n: state.countdown })
  if (state.playing)
    return t('status.playing', { round: state.round, total: state.repeat || t('status.infinite') })
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

/* iOS 式滾動條：僅滾動時顯示 */
const mainEl = ref(null)
const scrolling = ref(false)
let scrollTimer = null

const onScroll = () => {
  scrolling.value = true
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    scrolling.value = false
  }, 700)
}

onMounted(() => {
  mainEl.value?.addEventListener('scroll', onScroll, { passive: true })

  const api = window.electronApi
  if (!api) return

  api.marco.onStatus((s) => {
    state.recording = s.recording
    state.playing = s.playing
    state.count = s.count
    state.countdown = s.countdown || 0
    state.round = s.round || 0
    state.repeat = s.repeat ?? 1
    state.speed = s.speed ?? 1
  })

  api.autoClick.onStatus((s) => {
    state.autoClickRunning = s.running
    state.autoClickClicked = s.clicked || 0
    state.autoClickReason = s.reason || null
    state.autoClickCountdown = s.countdown || 0
  })

  api.settings?.onChange?.((next) => syncSettings(next))
  api.settings?.get?.().then((next) => syncSettings(next))

  api.app?.onHookStatus?.((payload) => {
    state.hookReady = !!payload?.ready
    state.hookNeedPermission = !!payload?.needPermission
  })

  api.app?.getVersion?.().then((v) => {
    if (v) state.appVersion = v
  })

  const applyRecords = (payload) => {
    if (!payload) return
    state.records = payload.items || []
    state.selectedId = payload.selectedId ?? null
    state.folderPath = payload.folder || ''
  }

  api.records.onChanged(applyRecords)
  api.records.get().then(applyRecords)
})

onBeforeUnmount(() => {
  mainEl.value?.removeEventListener('scroll', onScroll)
  clearTimeout(scrollTimer)
})

const minimize = () => window.electronApi?.window.minimize()
const close = () => window.electronApi?.window.close()
const toMini = () => window.electronApi?.window.setMode('mini')

const syncSettings = (next) => {
  if (!next) return
  state.settings = next
  state.mode = next.window?.mode === 'mini' ? 'mini' : 'full'
  state.pinned = !!next.window?.pinned
  applyLocale(next.ui?.locale)
}
</script>

<style scoped>
.window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background:
    radial-gradient(1000px 600px at 12% -10%, rgba(109, 140, 255, 0.18), transparent 60%),
    radial-gradient(800px 500px at 100% 100%, rgba(70, 224, 200, 0.12), transparent 60%),
    var(--bg);
}

/* ---------- 自繪標題列 ---------- */
.titlebar {
  height: 42px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 0 14px;
  background: rgba(12, 15, 28, 0.86);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand-name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
}

.brand-sub {
  font-size: 11px;
  color: var(--text-dim);
}

.window-controls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 38px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.win-btn svg {
  width: 12px;
  height: 12px;
}

.win-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}

.win-close:hover {
  color: #fff;
  background: rgba(255, 93, 115, 0.85);
}

/* ---------- 主體 ---------- */
.app {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* ---------- sidebar ---------- */
.sidebar {
  width: 200px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
  background: rgba(12, 15, 28, 0.72);
  border-right: 1px solid var(--border);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.nav-item:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.nav-item.active {
  color: #fff;
  background: linear-gradient(90deg, rgba(109, 140, 255, 0.28), rgba(109, 140, 255, 0.06));
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--accent), var(--accent-2));
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
}

.nav-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  color: var(--text-dim);
}

.footer-version {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.7;
  letter-spacing: 0.3px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  flex: none;
}

.dot-idle {
  background: var(--text-dim);
}

.dot-error {
  background: var(--danger);
  box-shadow: 0 0 0 4px rgba(255, 93, 115, 0.18);
}

.dot-rec {
  background: var(--danger);
  box-shadow: 0 0 0 4px rgba(255, 93, 115, 0.18);
  animation: pulse 1.4s infinite;
}

.dot-play {
  background: var(--accent-2);
  box-shadow: 0 0 0 4px rgba(70, 224, 200, 0.18);
  animation: pulse 1.4s infinite;
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

/* ---------- main + iOS 式滾動條 ---------- */
.main {
  flex: 1;
  min-width: 0;
  padding: 24px 26px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.main::-webkit-scrollbar {
  width: 10px;
}

.main::-webkit-scrollbar-track {
  background: transparent;
}

.main::-webkit-scrollbar-thumb {
  background: transparent;
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
  transition: background-color 0.25s ease;
}

.main.is-scrolling {
  scrollbar-color: rgba(255, 255, 255, 0.24) transparent;
}

.main.is-scrolling::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.24);
  background-clip: padding-box;
}

.main.is-scrolling::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.4);
  background-clip: padding-box;
}
</style>
