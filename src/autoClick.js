import robot from 'robotjs'
import log from './core/logger'

const DEFAULT_OPTIONS = {
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
  // 起始倒數（秒），0 表示立即開始
  countdown: 0,
}

const clampNum = (v, min, max, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function createAutoClick(notify = () => {}) {
  let timer = null
  let upTimer = null
  let countdownTimer = null
  let countdownLeft = 0
  let clicked = 0
  let startedAt = 0
  let pressedButton = null
  let reason = null
  let active = false

  const emit = (force = true) =>
    notify(
      {
        running: active,
        clicked,
        reason,
        elapsed: active && startedAt ? Date.now() - startedAt : 0,
        countdown: Math.max(0, Math.ceil(countdownLeft)),
      },
      force
    )

  const releaseButton = () => {
    if (!pressedButton) return
    try {
      robot.mouseToggle('up', pressedButton)
    } catch (err) {
      log.warn('釋放滑鼠鍵失敗', err)
    }
    pressedButton = null
  }

  function stop(stopReason = 'manual') {
    active = false
    if (timer) clearTimeout(timer)
    if (upTimer) clearTimeout(upTimer)
    if (countdownTimer) clearInterval(countdownTimer)
    timer = null
    upTimer = null
    countdownTimer = null
    countdownLeft = 0
    releaseButton()
    if (stopReason) reason = stopReason
    emit()
    return true
  }

  function normalize(raw = {}) {
    const o = { ...DEFAULT_OPTIONS, ...raw }
    return {
      interval: Math.round(clampNum(o.interval, 10, 3600000, 100)),
      button: ['left', 'right', 'middle'].includes(o.button) ? o.button : 'left',
      jitter: clampNum(o.jitter, 0, 80, 0),
      pressDuration: Math.round(clampNum(o.pressDuration, 0, 5000, 0)),
      double: !!o.double,
      mode: o.mode === 'fixed' ? 'fixed' : 'cursor',
      x: Math.round(clampNum(o.x, -32768, 32768, 0)),
      y: Math.round(clampNum(o.y, -32768, 32768, 0)),
      maxClicks: Math.round(clampNum(o.maxClicks, 0, 1000000, 0)),
      maxDurationMs: Math.round(clampNum(o.maxDurationMs, 0, 86400000, 0)),
      countdown: Math.round(clampNum(o.countdown, 0, 30, 0)),
    }
  }

  function schedule(options) {
    const jitterFactor = options.jitter ? 1 + (Math.random() * 2 - 1) * (options.jitter / 100) : 1
    const delay = Math.max(5, Math.round(options.interval * jitterFactor))
    timer = setTimeout(() => tick(options), delay)
  }

  function performClick(options) {
    if (options.mode === 'fixed') {
      try {
        robot.moveMouse(options.x, options.y)
      } catch (err) {
        log.warn('移動滑鼠失敗', err)
      }
    }

    if (options.double) {
      // robotjs 的 double 點擊自帶 down/up 組合，與 pressDuration 互斥
      robot.mouseClick(options.button, true)
      clicked += 2
      return
    }

    robot.mouseToggle('down', options.button)
    pressedButton = options.button
    clicked += 1

    if (options.pressDuration > 0) {
      upTimer = setTimeout(() => {
        upTimer = null
        releaseButton()
      }, options.pressDuration)
    } else {
      releaseButton()
    }
  }

  function tick(options) {
    if (!active) return
    timer = null

    if (options.maxDurationMs > 0 && Date.now() - startedAt >= options.maxDurationMs) {
      stop('duration')
      return
    }

    try {
      performClick(options)
    } catch (err) {
      log.error('連點執行失敗', err)
      stop('error')
      return
    }

    if (options.maxClicks > 0 && clicked >= options.maxClicks) {
      stop('clicks')
      return
    }

    emit(false)
    schedule(options)
  }

  function start(raw) {
    const options = normalize(raw)
    stop(null)

    // 有起始倒數時先進入倒數階段，倒數結束才真正開始連點
    if (options.countdown > 0) {
      active = true
      clicked = 0
      reason = null
      startedAt = 0
      countdownLeft = options.countdown
      emit()
      countdownTimer = setInterval(() => {
        countdownLeft -= 0.2
        if (countdownLeft <= 0) {
          clearInterval(countdownTimer)
          countdownTimer = null
          countdownLeft = 0
          beginClick(options)
          return
        }
        emit(false)
      }, 200)
      return true
    }

    return beginClick(options)
  }

  function beginClick(options) {
    active = true
    clicked = 0
    reason = null
    startedAt = Date.now()
    countdownLeft = 0
    performClick(options)
    if (options.maxClicks > 0 && clicked >= options.maxClicks) {
      stop('clicks')
      return true
    }
    emit()
    schedule(options)
    return true
  }

  function getPosition() {
    try {
      return robot.getMousePos()
    } catch (err) {
      log.warn('取得滑鼠位置失敗', err)
      return null
    }
  }

  return { start, stop, emit, getPosition, normalize }
}
