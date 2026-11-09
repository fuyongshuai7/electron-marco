import { reactive } from 'vue'

export const state = reactive({
  activeMenu: 'record',
  recording: false,
  playing: false,
  count: 0,
  countdown: 0,
  round: 0,
  repeat: 1,
  speed: 1,
  autoClickRunning: false,
  autoClickClicked: 0,
  autoClickReason: null,
  autoClickCountdown: 0,
  records: [],
  selectedId: null,
  folderPath: '',
  // 清單搜尋關鍵字（只在前端過濾，不影響資料本身）
  search: '',
  settings: null,
  hookReady: true,
  hookNeedPermission: false,
  appVersion: '',
  // 介面形態：full 完整 / mini 迷你懸浮窗
  mode: 'full',
  // 迷你窗是否置頂（圖釘）
  pinned: false,
  // 主程序觸發的確認對話框（自繪，取代系統 showMessageBox）
  dialog: {
    open: false,
    id: null,
    kind: 'info',
    title: '',
    message: '',
    detail: '',
    buttons: [],
    defaultId: 0,
    cancelId: 0,
  },
})
