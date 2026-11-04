import robot from 'robotjs'
import { uIOhook } from 'uiohook-napi'
import log from './core/logger'
import { comboModifierCodes } from './core/hotkey'

const keyState = {
  4: 'down', // EVENT_KEY_PRESSED
  5: 'up', // EVENT_KEY_RELEASED
  7: 'down', // EVENT_MOUSE_PRESSED
  8: 'up', // EVENT_MOUSE_RELEASED
}
const mouseEventType = { 1: 'left', 2: 'right', 3: 'middle' }

// 回放鍵碼別名：uiohook-napi 原生層無法注入的鍵碼改用等效鍵（見 applyEvent keyboard）
const REPLAY_KEY_ALIASES = {
  3612: 28, // NumpadEnter → Enter
}

const DEFAULT_OPTIONS = {
  speed: 1,
  repeat: 1,
  jitter: 0,
  countdown: 3,
  smoothMouse: false,
  loopGap: 600,
  captureMouseMove: false,
  moveThrottleMs: 30,
  moveMinDistance: 4,
}

const cloneEvent = (e, kind) => {
  const base = { kind, type: e.type, time: e.time }
  switch (kind) {
    case 'keyboard':
      return { ...base, keycode: e.keycode }
    case 'wheel':
      return { ...base, x: e.x, y: e.y, amount: e.amount, rotation: e.rotation, direction: e.direction }
    case 'move':
      return { ...base, x: e.x, y: e.y }
    default:
      return { ...base, x: e.x, y: e.y, button: e.button, clicks: e.clicks }
  }
}

export function createMarco(notify = () => {}, deps = {}) {
  const { onRecorded = () => {} } = deps

  let options = { ...DEFAULT_OPTIONS }
  let isRecording = false
  let isPlaying = false
  let countdownLeft = 0
  let round = 0
  let index = 0
  let timeout = null
  let countdownTimer = null
  let lastEmit = 0

  const recordingCollection = []
  const heldKeys = new Set()
  const heldButtons = new Set()
  let lastMove = null

  const total = () => recordingCollection.length

  const emit = (force = true) => {
    const now = Date.now()
    if (!force && now - lastEmit < 120) return
    lastEmit = now
    notify({
      recording: isRecording,
      playing: isPlaying,
      count: total(),
      countdown: Math.max(0, Math.ceil(countdownLeft)),
      round,
      repeat: options.repeat,
      speed: options.speed,
      index: isPlaying ? index : 0,
      total: total(),
    })
  }

  /* ---------- 選項 ---------- */
  function setOptions(patch = {}) {
    const next = { ...options }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || !(k in DEFAULT_OPTIONS)) continue
      next[k] = v
    }
    next.speed = Math.min(10, Math.max(0.1, Number(next.speed) || 1))
    next.repeat = Math.max(0, Math.round(Number(next.repeat) || 0))
    next.jitter = Math.min(80, Math.max(0, Number(next.jitter) || 0))
    next.countdown = Math.min(30, Math.max(0, Math.round(Number(next.countdown) || 0)))
    next.loopGap = Math.min(60000, Math.max(0, Math.round(Number(next.loopGap) || 0)))
    next.moveThrottleMs = Math.min(500, Math.max(5, Math.round(Number(next.moveThrottleMs) || 30)))
    next.moveMinDistance = Math.min(200, Math.max(0, Math.round(Number(next.moveMinDistance) || 4)))
    options = next
    emit()
    return options
  }

  const getOptions = () => ({ ...options })

  /* ---------- 錄製 ---------- */
  function push(e, kind) {
    // 統一用本程序時鐘蓋掉鉤子的 time：Windows 上鉤子給的是開機毫秒，
    // seedStartPosition 卻用 Date.now()（epoch 毫秒），兩種時鐘混用會讓
    // 回放排程把所有事件塌縮到 0、一次全部爆發。全部改用 Date.now() 即一致。
    recordingCollection.push({ ...cloneEvent(e, kind), time: Date.now() })
    emit(false)
  }

  function seedStartPosition() {
    if (!options.captureMouseMove) return
    try {
      const pos = robot.getMousePos()
      lastMove = { x: pos.x, y: pos.y, time: Date.now() }
      push({ type: 9, time: lastMove.time, x: pos.x, y: pos.y }, 'move')
    } catch (err) {
      log.warn('無法取得滑鼠初始位置', err)
    }
  }

  function recordMove(e) {
    if (!options.captureMouseMove) return
    const now = Date.now()
    if (lastMove) {
      if (now - lastMove.time < options.moveThrottleMs) return
      if (Math.hypot(e.x - lastMove.x, e.y - lastMove.y) < options.moveMinDistance) return
    }
    lastMove = { x: e.x, y: e.y, time: now }
    push(e, 'move')
  }

  function handleKeyDown(e) {
    if (!isRecording) return
    push(e, 'keyboard')
  }

  function handleKeyUp(e) {
    if (!isRecording) return
    push(e, 'keyboard')
  }

  function handleMouse(e, kind) {
    if (!isRecording) return
    if (kind === 'move') return recordMove(e)
    push(e, kind)
    lastMove = { x: e.x, y: e.y, time: Date.now() }
  }

  /** 快捷鍵觸發時，把已經被錄進去的修飾鍵移除，避免腳本裡出現半截組合鍵 */
  function consumeCombo(combo) {
    if (!isRecording || !combo) return
    const codes = new Set(comboModifierCodes(combo))
    if (!codes.size) return
    while (recordingCollection.length) {
      const last = recordingCollection[recordingCollection.length - 1]
      if (last.kind === 'keyboard' && keyState[last.type] === 'down' && codes.has(last.keycode)) {
        recordingCollection.pop()
      } else {
        break
      }
    }
    emit(false)
  }

  function startRecord() {
    if (isRecording || isPlaying) return false
    // 若回放倒數計時還在跑，必須清掉，否則倒數結束會在錄製途中開始回放
    clearIntervalSafe(countdownTimer)
    countdownTimer = null
    countdownLeft = 0
    isRecording = true
    round = 0
    index = 0
    recordingCollection.length = 0
    lastMove = null
    seedStartPosition()
    emit()
    return true
  }

  function finishRecord({ keep }) {
    if (!isRecording) return false
    isRecording = false
    lastMove = null
    const events = recordingCollection.slice()
    emit()
    if (keep && events.length) onRecorded(events)
    return true
  }

  const stopRecord = () => finishRecord({ keep: true })
  /** 緊急停止：直接丟棄本次錄製，不產生任何記錄 */
  const abortRecord = () => finishRecord({ keep: false })

  /* ---------- 回放 ---------- */
  function releaseAll() {
    for (const code of heldKeys) {
      try {
        uIOhook.keyToggle(code, 'up')
      } catch (err) {
        log.warn('釋放按鍵失敗', code, err)
      }
    }
    heldKeys.clear()
    for (const button of heldButtons) {
      try {
        robot.mouseToggle('up', button)
      } catch (err) {
        log.warn('釋放滑鼠鍵失敗', button, err)
      }
    }
    heldButtons.clear()
  }

  function applyEvent(item) {
    switch (item.kind) {
      case 'keyboard': {
        const state = keyState[item.type]
        if (!state) return
        // uiohook-napi 原生層在鉤子運行時無法注入 NumpadEnter（0x0E1C 缺掃描碼
        // 映射，會印 "Unable to lookup scancode" 並靜默丟棄事件），實測全表僅此一鍵。
        // 回放時改用等效的主 Enter，錄製資料仍保留原始鍵碼。
        const kc = REPLAY_KEY_ALIASES[item.keycode] ?? item.keycode
        uIOhook.keyToggle(kc, state)
        if (state === 'down') heldKeys.add(kc)
        else heldKeys.delete(kc)
        break
      }
      case 'mouse': {
        const state = keyState[item.type]
        if (!state) return
        const button = mouseEventType[item.button] || 'left'
        if (Number.isFinite(item.x) && Number.isFinite(item.y)) robot.moveMouse(item.x, item.y)
        robot.mouseToggle(state, button)
        if (state === 'down') heldButtons.add(button)
        else heldButtons.delete(button)
        break
      }
      case 'move': {
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) return
        if (options.smoothMouse) robot.moveMouseSmooth(item.x, item.y)
        else robot.moveMouse(item.x, item.y)
        break
      }
      case 'wheel': {
        const amount = (item.amount || 0) * (item.rotation || 1) * -1
        // direction 3 = 垂直、4 = 水平（傾斜滾輪）
        if (item.direction === 4) robot.scrollMouse(amount, 0)
        else robot.scrollMouse(0, amount)
        break
      }
      default:
        break
    }
  }

  /** 依抖動設定重算每一個事件的相對時間，保證順序不被打亂 */
  function buildSchedule(events, jitterPercent) {
    const jitter = Math.min(80, Math.max(0, jitterPercent)) / 100
    const schedule = new Array(events.length)
    let acc = 0
    for (let i = 0; i < events.length; i += 1) {
      if (i > 0) {
        const delta = Math.max(0, events[i].time - events[i - 1].time)
        acc += jitter ? delta * (1 + (Math.random() * 2 - 1) * jitter) : delta
      }
      schedule[i] = acc
    }
    return schedule
  }

  function startCountdown() {
    const seconds = options.countdown
    if (seconds <= 0) {
      beginPlayback()
      return
    }
    countdownLeft = seconds
    emit()
    clearIntervalSafe(countdownTimer)
    countdownTimer = setInterval(() => {
      countdownLeft -= 0.2
      if (countdownLeft <= 0) {
        clearIntervalSafe(countdownTimer)
        countdownTimer = null
        countdownLeft = 0
        beginPlayback()
        return
      }
      emit()
    }, 200)
  }

  function beginPlayback() {
    if (isPlaying || recordingCollection.length === 0) return
    isPlaying = true
    round = 0
    emit()
    runRound()
  }

  function runRound() {
    const events = recordingCollection
    const { speed, jitter, repeat, loopGap } = options
    round += 1
    index = 0
    const schedule = buildSchedule(events, jitter)
    const startedAt = Date.now()

    const tick = () => {
      if (!isPlaying) return
      const elapsed = Date.now() - startedAt

      // 以絕對時間排程，避免 setInterval / 相對延遲造成的誤差累積
      while (index < schedule.length && schedule[index] / speed <= elapsed) {
        applyEvent(events[index])
        index += 1
      }

      if (index >= schedule.length) {
        releaseAll()
        const done = repeat > 0 && round >= repeat
        if (done) {
          stopPlay({ natural: true })
          return
        }
        timeout = setTimeout(() => {
          if (!isPlaying) return
          runRound()
        }, loopGap)
        emit()
        return
      }

      const delay = Math.max(1, Math.min(schedule[index] / speed - elapsed, 500))
      timeout = setTimeout(tick, delay)
      emit(false)
    }

    emit()
    tick()
  }

  function play() {
    if (isRecording || isPlaying || recordingCollection.length === 0) return false
    if (countdownTimer) return false
    round = 0
    index = 0
    startCountdown()
    return true
  }

  function clearIntervalSafe(timer) {
    if (timer) clearInterval(timer)
  }

  function stopPlay({ natural = false } = {}) {
    const wasBusy = isPlaying || !!countdownTimer
    if (timeout) clearTimeout(timeout)
    timeout = null
    clearIntervalSafe(countdownTimer)
    countdownTimer = null
    countdownLeft = 0
    if (isPlaying) {
      isPlaying = false
      if (!natural) releaseAll()
    }
    if (wasBusy || !isPlaying) emit()
    return true
  }

  /** 緊急停止：中斷倒數 / 回放，丟棄進行中的錄製，並還原所有按住的鍵 */
  function emergencyStop() {
    const wasRecording = isRecording
    abortRecord()
    stopPlay()
    releaseAll()
    if (wasRecording) emit()
    else emit()
    return true
  }

  function setEvents(arr) {
    if (isRecording || isPlaying) return false
    recordingCollection.length = 0
    if (Array.isArray(arr)) recordingCollection.push(...arr)
    round = 0
    index = 0
    emit()
    return true
  }

  function getEvents() {
    return recordingCollection.slice()
  }

  return {
    startRecord,
    stopRecord,
    abortRecord,
    play,
    stopPlay,
    emergencyStop,
    releaseAll,
    handleKeyDown,
    handleKeyUp,
    handleMouse,
    consumeCombo,
    setEvents,
    getEvents,
    setOptions,
    getOptions,
    emit,
  }
}
