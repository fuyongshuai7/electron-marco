<template>
  <section class="view">
    <header class="view-header">
      <h1>{{ $t('record.title') }}</h1>
      <p>{{ $t('record.subtitle') }}</p>
    </header>

    <div v-if="!state.hookReady" class="panel warn-panel">
      {{ $t('record.hookWarn', { perm: state.hookNeedPermission ? $t('record.hookPerm') : '' }) }}
    </div>

    <div class="panel status-panel">
      <div class="status-badge" :class="statusClass">
        <span class="ring"></span>
        <div class="status-meta">
          <span class="status-text">{{ statusText }}</span>
          <span class="status-hint">{{ statusHint }}</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <span class="stat-value">{{ state.count }}</span>
          <span class="stat-label">{{ $t('record.statTarget') }}</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ state.recording ? $t('record.on') : $t('record.off') }}</span>
          <span class="stat-label">{{ $t('record.statSwitch') }}</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ roundLabel }}</span>
          <span class="stat-label">{{ $t('record.statProgress') }}</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2 class="panel-title">{{ $t('record.playbackTitle') }}</h2>
        <button class="btn btn-ghost btn-sm" @click="state.activeMenu = 'settings'">
          {{ $t('record.hotkeySettings') }}
        </button>
      </div>
      <div class="grid">
        <label class="field-inline">
          <span>{{ $t('record.speed') }}</span>
          <div class="stepper">
            <input
              v-model.number="form.speed"
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              @change="commitPlayback"
            />
            <div class="stepper-actions">
              <button type="button" aria-label="+" @click="step('speed', 0.1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
              <button type="button" aria-label="-" @click="step('speed', -0.1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </label>

        <label class="field-inline">
          <span>{{ $t('record.repeat') }}</span>
          <div class="stepper">
            <input v-model.number="form.repeat" type="number" min="0" step="1" @change="commitPlayback" />
            <div class="stepper-actions">
              <button type="button" aria-label="+" @click="step('repeat', 1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
              <button type="button" aria-label="-" @click="step('repeat', -1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </label>

        <label class="field-inline">
          <span>{{ $t('record.countdown') }}</span>
          <div class="stepper">
            <input v-model.number="form.countdown" type="number" min="0" max="30" step="1" @change="commitPlayback" />
            <div class="stepper-actions">
              <button type="button" aria-label="+" @click="step('countdown', 1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
              <button type="button" aria-label="-" @click="step('countdown', -1)">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </label>

        <label class="field-inline">
          <span>{{ $t('record.jitter') }}</span>
          <input
            v-model.number="form.jitter"
            class="range"
            type="range"
            min="0"
            max="80"
            step="1"
            @change="commitPlayback"
          />
          <span class="range-value">{{ form.jitter }}%</span>
        </label>

        <label class="switch">
          <input type="checkbox" v-model="form.smoothMouse" @change="commitPlayback" />
          <span class="switch-track"></span>
          <span class="switch-label">{{ $t('record.smoothMouse') }}</span>
        </label>
      </div>
      <p class="panel-desc">{{ $t('record.playbackDesc') }}</p>
    </div>

    <div class="panel">
      <h2 class="panel-title">{{ $t('record.hotkeysTitle') }}</h2>
      <ul class="hotkey-list">
        <li v-for="h in hotkeyRows" :key="h.action">
          <kbd class="kbd-wide">{{ h.label }}</kbd>
          <div class="hotkey-info">
            <span class="hotkey-name">{{ h.name }}</span>
            <span class="hotkey-desc">{{ h.desc }}</span>
          </div>
        </li>
      </ul>
      <p class="panel-desc">{{ $t('record.hotkeysDesc') }}</p>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2 class="panel-title">{{ $t('record.recordsTitle') }}</h2>
        <div class="head-actions">
          <input v-model="state.search" class="search" type="search" :placeholder="$t('record.search')" />
          <button class="btn btn-ghost btn-sm" @click="doMerge" :disabled="mergeIds.length < 2">
            {{ $t('record.merge', { n: mergeIds.length }) }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="openFolder">{{ $t('record.openFolder') }}</button>
          <button class="btn btn-ghost btn-sm" :disabled="busy" @click="doImport">{{ $t('record.import') }}</button>
          <button class="btn btn-ghost btn-sm" :disabled="state.records.length === 0" @click="doExportAll">
            {{ $t('record.exportAll') }}
          </button>
          <button class="btn btn-ghost btn-sm" :disabled="!hasUnsaved" @click="saveAll">
            {{ $t('record.saveAll', { n: unsavedCount }) }}
          </button>
          <button class="btn btn-ghost btn-sm btn-danger" :disabled="state.records.length === 0 || busy" @click="doClearAll">
            {{ $t('record.clearAll') }}
          </button>
        </div>
      </div>
      <p class="panel-desc">
        {{ $t('record.recordsDescLine1') }}
        <br />
        {{ $t('record.recordsDescLine2') }}
      </p>

      <ul v-if="filtered.length" class="record-list">
        <li
          v-for="r in filtered"
          :key="r.id"
          class="record-item"
          :class="{ active: r.id === state.selectedId, dragging: dragId === r.id }"
          draggable="false"
          @click="selectRecord(r.id)"
          @dragover.prevent="dragOverId = r.id"
          @drop.prevent="onDrop(r.id)"
        >
          <span
            class="rec-grip"
            :title="$t('record.gripTip')"
            draggable="true"
            @click.stop
            @dragstart.stop="dragId = r.id"
            @dragend.stop="onDragEnd"
          ></span>

          <div class="rec-main">
            <input
              v-if="editingId === r.id"
              :ref="setNameInput"
              v-model="editingName"
              class="rec-name-input"
              @click.stop
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename"
            />
            <template v-else>
              <span class="rec-name">{{ r.name }}</span>
              <span class="rec-meta">
                {{ r.count }} {{ $t('record.eventCount') }} · {{ formatDuration(r.duration) }} ·
                {{ formatTime(r.updatedAt) }}
                <span class="tag" :class="r.saved ? 'tag-saved' : 'tag-temp'">
                  {{ r.saved ? $t('record.saved') : $t('record.unsaved') }}
                </span>
              </span>
            </template>
          </div>

          <div class="rec-actions" @click.stop>
            <input
              class="rec-check"
              type="checkbox"
              :checked="mergeIds.includes(r.id)"
              :title="$t('record.mergePickTip')"
              @change="toggleMerge(r.id)"
              @click.stop
            />
            <button v-if="!r.saved" class="icon-btn primary" :title="$t('record.storeLocal')" @click="saveRecord(r.id)">
              {{ $t('record.storeLocal') }}
            </button>
            <button class="icon-btn" :title="$t('record.exportTip')" @click="exportRecord(r.id)">
              {{ $t('record.exportBtn') }}
            </button>
            <button class="icon-btn" :title="$t('record.duplicateTip')" @click="duplicate(r.id)">✚</button>
            <button class="icon-btn" title="✎" @click="startRename(r)">✎</button>
            <button class="icon-btn danger" title="✕" @click="removeRecord(r)">✕</button>
          </div>
        </li>
      </ul>
      <p v-else class="empty">
        {{ state.search ? $t('record.emptySearch') : $t('record.emptyNone') }}
      </p>

      <p v-if="state.folderPath" class="folder-path">{{ state.folderPath }}</p>
      <p v-if="storageMsg" class="storage-msg" :class="storageMsgKind">{{ storageMsg }}</p>
    </div>

    <div class="panel" v-if="state.selectedId">
      <div class="panel-head">
        <h2 class="panel-title">{{ $t('record.editorTitle') }}</h2>
        <div class="head-actions">
          <label class="mini-field">
            {{ $t('record.trimHead') }}
            <input v-model.number="headMs" type="number" min="0" step="100" />
            {{ $t('record.ms') }}
          </label>
          <button class="btn btn-ghost btn-sm" @click="applyTrim">{{ $t('record.applyTrim') }}</button>
        </div>
      </div>
      <p class="panel-desc">
        {{
          $t('record.editorDesc', {
            total: eventsTotal,
            trunc: eventsTruncated ? $t('record.editorTrunc', { n: events.length }) : '',
          })
        }}
      </p>
      <div class="head-actions tail-row">
        <label class="mini-field">
          {{ $t('record.trimTail') }}
          <input v-model.number="tailMs" type="number" min="0" step="100" />
          {{ $t('record.ms') }}
        </label>
      </div>

      <ul class="event-list">
        <li v-for="ev in events" :key="ev.index">
          <span class="ev-offset">{{ ev.offset }} ms</span>
          <span class="ev-kind" :class="`ev-${ev.kind}`">{{ kindLabel(ev.kind) }}</span>
          <span class="ev-detail">{{ eventDetail(ev) }}</span>
          <span class="ev-state">{{ ev.down ? $t('record.pressDown') : $t('record.pressUp') }}</span>
          <div class="ev-actions">
            <button class="icon-btn" :title="$t('record.evDeleteTip')" @click="removeEvent(ev.index)">✕</button>
            <button class="icon-btn" :title="$t('record.evStartTip')" @click="trimBefore(ev.index)">↧</button>
            <button class="icon-btn danger" :title="$t('record.evCutTip')" @click="truncateAt(ev.index)">⇥</button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { state } from '../store'

const { t } = useI18n()

const recApi = () => window.electronApi?.records
const api = () => window.electronApi

const statusText = computed(() => {
  if (state.recording) return t('status.recording')
  if (state.countdown > 0) return t('status.playCountdown', { n: state.countdown })
  if (state.playing) return t('status.playing', { round: state.round, total: state.repeat || t('status.infinite') })
  return t('status.idle')
})

const statusClass = computed(() => {
  if (state.recording) return 'is-rec'
  if (state.playing || state.countdown > 0) return 'is-play'
  return 'is-idle'
})

const statusHint = computed(() => {
  if (state.recording) return t('record.statusHint.recording')
  if (state.countdown > 0) return t('record.statusHint.countdown')
  if (state.playing) return t('record.statusHint.playing')
  return t('record.statusHint.idle')
})

const roundLabel = computed(() => {
  if (!state.round) return t('record.dash')
  return `${state.round}/${state.repeat || t('status.infinite')}`
})

const HOTKEY_ACTIONS = ['startRecord', 'stopRecord', 'play', 'stopPlay', 'emergencyStop']

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

const hotkeyRows = computed(() =>
  HOTKEY_ACTIONS.map((action) => ({
    action,
    label: comboText(state.settings?.hotkeys?.[action]),
    name: t(`hotkeys.names.${action}`),
    desc: t(`hotkeys.descs.${action}`),
  }))
)

/* ---------- 回放設定表單 ---------- */
const form = reactive({ speed: 1, repeat: 1, jitter: 0, countdown: 3, smoothMouse: false })
watch(
  () => state.settings?.playback,
  (pb) => {
    if (!pb) return
    Object.assign(form, {
      speed: pb.speed,
      repeat: pb.repeat,
      jitter: pb.jitter,
      countdown: pb.countdown,
      smoothMouse: pb.smoothMouse,
    })
  },
  { immediate: true }
)

const commitPlayback = () => {
  const patch = {
    speed: Math.min(10, Math.max(0.1, Number(form.speed) || 1)),
    repeat: Math.max(0, Math.round(Number(form.repeat) || 0)),
    jitter: Math.min(80, Math.max(0, Number(form.jitter) || 0)),
    countdown: Math.min(30, Math.max(0, Math.round(Number(form.countdown) || 0))),
    smoothMouse: !!form.smoothMouse,
  }
  Object.assign(form, patch)
  api()?.marco?.setOptions?.(patch)
}

const step = (key, delta) => {
  const min = key === 'speed' ? 0.1 : 0
  const raw = (Number(form[key]) || 0) + delta
  form[key] = Math.max(min, Number(raw.toFixed(2)))
  commitPlayback()
}

/* ---------- 清單 ---------- */
const busy = ref(false)
const editingId = ref(null)
const editingName = ref('')
const nameInput = ref(null)
const setNameInput = (el) => {
  nameInput.value = el
}
const storageMsg = ref('')
const storageMsgKind = ref('info')
const mergeIds = ref([])
const dragId = ref(null)
const dragOverId = ref(null)

const setMsg = (text, kind = 'info', timeout = 4000) => {
  storageMsg.value = text
  storageMsgKind.value = kind
  if (timeout) {
    setTimeout(() => {
      if (storageMsg.value === text) storageMsg.value = ''
    }, timeout)
  }
}

const unsavedCount = computed(() => state.records.filter((r) => !r.saved).length)
const hasUnsaved = computed(() => unsavedCount.value > 0)

const filtered = computed(() => {
  const q = state.search.trim().toLowerCase()
  if (!q) return state.records
  return state.records.filter((r) => (r.name || '').toLowerCase().includes(q))
})

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const formatDuration = (ms) => {
  const value = Number(ms) || 0
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

const selectRecord = async (id) => {
  if (state.recording || state.playing) {
    setMsg(t('record.msgBusy', { action: t('record.actionSwitch') }), 'warn', 2500)
    return
  }
  await recApi()?.select(id)
}

const saveRecord = async (id) => {
  const ok = await recApi()?.save(id)
  setMsg(ok ? t('record.msgSaved') : t('record.msgSaveFail'), ok ? 'success' : 'error', 2500)
}

const saveAll = async () => {
  const n = await recApi()?.saveAll()
  setMsg(n ? t('record.msgSaveAll', { n }) : t('record.msgNothingToSave'), n ? 'success' : 'info', 2500)
}

const doClearAll = async () => {
  if (state.recording || state.playing) {
    setMsg(t('record.msgBusy', { action: t('record.clearAll') }), 'warn')
    return
  }
  const r = await recApi()?.clear()
  if (!r) return
  if (r.ok) setMsg(t('record.msgClearedAll', { count: r.count }), 'success')
}

const exportRecord = async (id) => {
  const r = await recApi()?.export(id)
  if (!r) return
  if (r.ok) setMsg(t('record.msgExportedOne', { name: r.name, count: r.count }), 'success')
  else if (r.reason !== 'canceled') setMsg(t('record.msgExportFail', { msg: r.message || '' }), 'error')
}

const doExportAll = async () => {
  const r = await recApi()?.exportAll()
  if (!r) return
  if (r.ok) setMsg(t('record.msgExportedAll', { count: r.count, path: r.path }), 'success', 5000)
  else if (r.reason === 'empty') setMsg(t('record.msgListEmpty'), 'warn')
  else if (r.reason !== 'canceled') setMsg(t('record.msgExportFail', { msg: r.message || '' }), 'error')
}

const removeRecord = async (r) => {
  if (state.recording || state.playing) {
    setMsg(t('record.msgBusy', { action: t('record.actionDelete') }), 'warn', 2500)
    return
  }
  await recApi()?.remove(r.id)
  mergeIds.value = mergeIds.value.filter((id) => id !== r.id)
  setMsg(t('record.msgDeleted', { name: r.name }), 'info', 2500)
}

const duplicate = async (id) => {
  const ok = await recApi()?.duplicate(id)
  setMsg(ok ? t('record.msgDuplicated') : t('record.msgDupFail'), ok ? 'success' : 'error', 2500)
}

const toggleMerge = (id) => {
  mergeIds.value = mergeIds.value.includes(id)
    ? mergeIds.value.filter((v) => v !== id)
    : [...mergeIds.value, id]
}

const doMerge = async () => {
  if (mergeIds.value.length < 2) return
  const order = state.records.filter((r) => mergeIds.value.includes(r.id)).map((r) => r.id)
  const ok = await recApi()?.merge(order)
  mergeIds.value = []
  setMsg(ok ? t('record.msgMerged') : t('record.msgMergeFail'), ok ? 'success' : 'error', 2500)
}

/* ---------- 拖曳排序 ---------- */
const onDragEnd = () => {
  dragId.value = null
  dragOverId.value = null
}

const onDrop = async (targetId) => {
  const from = dragId.value
  const to = targetId
  onDragEnd()
  if (!from || from === to) return
  const list = state.records
  const fromIndex = list.findIndex((r) => r.id === from)
  const toIndex = list.findIndex((r) => r.id === to)
  if (fromIndex < 0 || toIndex < 0) return
  await recApi()?.moveTo(from, toIndex)
}

/* ---------- 重新命名 ---------- */
const startRename = async (r) => {
  editingId.value = r.id
  editingName.value = r.name
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

const commitRename = async () => {
  if (!editingId.value) return
  const id = editingId.value
  const name = editingName.value.trim()
  editingId.value = null
  if (!name || name === state.records.find((r) => r.id === id)?.name) return
  await recApi()?.rename(id, name)
  setMsg(t('record.msgRenamed'), 'success', 2000)
}

const cancelRename = () => {
  editingId.value = null
}

const openFolder = async () => {
  await recApi()?.openFolder()
}

const doImport = async () => {
  if (state.recording || state.playing) {
    setMsg(t('record.msgBusy', { action: t('record.actionImport') }), 'warn')
    return
  }
  busy.value = true
  const r = await recApi()?.import()
  busy.value = false
  if (!r) return
  if (r.ok) {
    setMsg(
      r.multiple
        ? t('record.msgImportedMulti', { count: r.count, events: r.events })
        : t('record.msgImportedOne', { name: r.name, events: r.events }),
      'success'
    )
  } else if (r.reason === 'invalid' || r.reason === 'parse') {
    setMsg(t('record.msgImportFail', { msg: r.message || '' }), 'error', 6000)
  }
}

/* ---------- 事件編輯 ---------- */
const events = ref([])
const eventsTotal = ref(0)
const eventsTruncated = ref(false)
const headMs = ref(0)
const tailMs = ref(0)

const KEY_NAMES = {
  1: 'Esc',
  14: 'Backspace',
  15: 'Tab',
  28: 'Enter',
  57: 'Space',
  58: 'CapsLock',
  69: 'NumLock',
  70: 'ScrollLock',
  71: '數字7',
  72: '數字8',
  73: '數字9',
  74: '數字-',
  75: '數字4',
  76: '數字5',
  77: '數字6',
  78: '數字+',
  79: '數字1',
  80: '數字2',
  81: '數字3',
  82: '數字0',
  83: '數字.',
  3612: 'Enter（數字鍵盤）',
  3613: 'Ctrl（右）',
  3637: '數字/',
  3639: 'PrintScreen',
  3640: 'Alt（右）',
  3655: 'Home',
  3657: 'PageUp',
  3663: 'End',
  3665: 'PageDown',
  3666: 'Insert',
  3667: 'Delete',
}

const keyLabel = (code) => {
  if (!code) return t('record.dash')
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  if (code >= 59 && code <= 68) return `F${code - 58}`
  if (code >= 88 && code <= 107) return `F${code - 76}`
  return `Key(${code})`
}

const kindLabel = (kind) => t(`record.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)

const eventDetail = (ev) => {
  if (ev.kind === 'keyboard') return keyLabel(ev.keycode)
  if (ev.kind === 'wheel') return `amount ${ev.amount} / rotation ${ev.rotation}`
  const btnKey = { 1: 'btnLeft', 2: 'btnRight', 3: 'btnMiddle' }[ev.button]
  const btn = btnKey ? ` · ${t(`record.${btnKey}`)}` : ''
  return `(${ev.x}, ${ev.y})${ev.kind === 'mouse' ? btn : ''}`
}

const loadEvents = async (id) => {
  if (!id) {
    events.value = []
    eventsTotal.value = 0
    return
  }
  const res = await recApi()?.listEvents(id)
  if (!res) return
  events.value = res.events || []
  eventsTotal.value = res.total || 0
  eventsTruncated.value = !!res.truncated
}

watch(
  () => state.selectedId,
  (id) => loadEvents(id),
  { immediate: true }
)

watch(
  () => state.records,
  () => {
    if (state.selectedId) loadEvents(state.selectedId)
  }
)

const removeEvent = async (index) => {
  const ok = await recApi()?.removeEvent(state.selectedId, index)
  if (ok) loadEvents(state.selectedId)
}

const trimBefore = async (index) => {
  const ok = await recApi()?.trimBefore(state.selectedId, index)
  setMsg(ok ? t('record.msgStartSet') : t('record.msgStartFail'), ok ? 'success' : 'warn', 2500)
  if (ok) loadEvents(state.selectedId)
}

const truncateAt = async (index) => {
  const ok = await recApi()?.truncateAt(state.selectedId, index)
  setMsg(ok ? t('record.msgTailTrimmed') : t('record.msgTailFail'), ok ? 'success' : 'warn', 2500)
  if (ok) loadEvents(state.selectedId)
}

const applyTrim = async () => {
  const ok = await recApi()?.trim(state.selectedId, {
    headMs: Number(headMs.value) || 0,
    tailMs: Number(tailMs.value) || 0,
  })
  setMsg(ok ? t('record.msgTrimmed') : t('record.msgTrimFail'), ok ? 'success' : 'warn', 3000)
  if (ok) loadEvents(state.selectedId)
}
</script>

<style scoped>
.status-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.warn-panel {
  border-color: rgba(255, 180, 87, 0.45);
  color: var(--warn);
  font-size: 12px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-badge .ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  flex: none;
  border: 2px solid var(--text-dim);
  position: relative;
}

.status-badge .ring::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: var(--text-dim);
}

.status-badge.is-rec .ring {
  border-color: var(--danger);
  animation: pulse 1.4s infinite;
}

.status-badge.is-rec .ring::after {
  background: var(--danger);
}

.status-badge.is-play .ring {
  border-color: var(--accent-2);
  animation: pulse 1.4s infinite;
}

.status-badge.is-play .ring::after {
  background: var(--accent-2);
}

.status-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-text {
  font-size: 18px;
  font-weight: 600;
}

.status-hint {
  font-size: 12px;
  color: var(--text-dim);
}

.stats {
  display: flex;
  gap: 28px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--text-dim);
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 26px;
  align-items: center;
  margin-bottom: 16px;
}

.field-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.field-inline input[type='number'] {
  width: 74px;
  padding: 0 0 0 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.field-inline input::-webkit-outer-spin-button,
.field-inline input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper {
  display: inline-flex;
  align-items: stretch;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
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
}

.stepper-actions button + button {
  border-top: 1px solid var(--border);
}

.stepper-actions button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.1);
}

.stepper-actions svg {
  width: 10px;
  height: 6px;
}

.range {
  width: 130px;
  accent-color: var(--accent);
}

.range-value {
  min-width: 40px;
  font-variant-numeric: tabular-nums;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
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
  font-size: 13px;
  color: var(--text);
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

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.panel-head .panel-title {
  margin: 0;
}

.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tail-row {
  margin: 0 0 12px;
}

.search {
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 12px;
  outline: none;
  width: 140px;
}

.search:focus {
  border-color: var(--accent);
}

.mini-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
}

.mini-field input {
  width: 84px;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 12px;
  outline: none;
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

.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.record-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.record-item.active {
  border-color: rgba(109, 140, 255, 0.55);
  background: linear-gradient(90deg, rgba(109, 140, 255, 0.18), rgba(109, 140, 255, 0.04));
}

.record-item.dragging {
  opacity: 0.5;
}

.rec-grip {
  width: 10px;
  height: 18px;
  flex: none;
  border-radius: 4px;
  cursor: grab;
  background: radial-gradient(circle, var(--text-dim) 1px, transparent 1.2px) 0 0 / 5px 5px;
}

.rec-main {
  flex: 1;
  min-width: 0;
}

.rec-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-meta {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 3px;
}

.rec-name-input {
  width: 100%;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 14px;
  outline: none;
}

.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
}

.tag-saved {
  color: var(--accent-2);
  background: rgba(70, 224, 200, 0.14);
}

.tag-temp {
  color: var(--warn);
  background: rgba(255, 180, 87, 0.14);
}

.rec-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.rec-check {
  accent-color: var(--accent);
  cursor: pointer;
}

.icon-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.14);
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.icon-btn.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), #8f7bff);
}

.icon-btn.danger:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 93, 115, 0.85);
}

/* ---------- 事件列表 ---------- */
.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.event-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 6px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}

.event-list li:first-child {
  border-top: 0;
}

.ev-offset {
  width: 84px;
  flex: none;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.ev-kind {
  width: 52px;
  flex: none;
  padding: 1px 6px;
  border-radius: 6px;
  text-align: center;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
}

.ev-keyboard {
  color: var(--accent);
}

.ev-mouse {
  color: var(--accent-2);
}

.ev-wheel {
  color: var(--warn);
}

.ev-move {
  color: var(--text-dim);
}

.ev-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-state {
  width: 44px;
  flex: none;
  color: var(--text-dim);
}

.ev-actions {
  display: flex;
  gap: 4px;
  flex: none;
}

.empty {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
}

.folder-path {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--text-dim);
  word-break: break-all;
}

.storage-msg {
  margin: 8px 0 0;
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

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
