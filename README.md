# Marco · 鍵鼠自動化

基於 Electron + Vue 3 的鍵鼠錄製 / 回放與自動連點工具。

## 功能

- **錄製與回放**：錄製鍵盤、滑鼠按鍵、滑鼠移動與滾輪操作，可選擇是否錄製移動軌跡。
- **回放參數**：速度倍率（0.1x ~ 10x）、回放次數（0 = 無限循環）、起始倒數、時間抖動、平滑移動滑鼠。
- **自動連點**：支援間隔抖動、按住時長、雙擊、固定座標連點、點擊次數上限與持續時間上限。
- **已錄製清單**：每次錄製結束後產生一筆記錄，可選取為回放目標，並支援：
  - 搜尋、拖曳排序
  - 儲存（寫入本機）/ 全部儲存
  - 重新命名（行內編輯）、建立複本、多筆合併
  - 刪除、單筆匯出、整表匯出、匯入（單筆或整表 JSON）
  - 事件編輯：裁剪開頭 / 結尾、刪除單一事件、重設起點、從此事件後刪除
- **本機持久化**：已「儲存」的錄製會落盤，每次寫入前自動輪替備份。
- **托盤常駐**：關閉視窗可縮到托盤，托盤選單顯示即時狀態並提供「緊急停止」。
- **設定持久化**：快捷鍵、回放與連點參數、資料目錄、開機自啟都存於 `userData/settings.json`。

## 快捷鍵（預設，可在「設定」頁修改）

觸發全部採用**組合鍵**，避免與其他軟體搶用單一功能鍵。

| 快捷鍵 | 功能 |
| ------ | ---- |
| `Ctrl + Alt + F6` | 開始錄製 |
| `Ctrl + Alt + F7` | 停止錄製（加入清單） |
| `Ctrl + Alt + F8` | 回放（目前選取的錄製） |
| `Ctrl + Alt + F9` | 停止回放（同時放開所有按住的鍵） |
| `Ctrl + Alt + F10` | 開始連點 |
| `Ctrl + Alt + F11` | 停止連點 |
| `Ctrl + Alt + F12` | 緊急停止（停止錄製 / 回放 / 連點，**不保留**本次錄製） |

錄製與回放**沒有**開始按鈕，一律由上述全域快捷鍵觸發（連點頁保留手動開始 / 停止鍵）。
修改方式：設定頁 → 該功能右側「錄製」→ 直接按下新的組合鍵。

## 安裝與執行

```bash
npm install
npm start
```

開發模式下視窗預設 900×640，寬度鎖定、高度可拖動調整（高度會被記住）。

## 專案結構

```
src/
├── main.js              # 主程序：單實例鎖、視窗、輸入鉤子、IPC、關閉確認
├── preload.js           # contextBridge 暴露 API（含 IPC 白名單）
├── tray.js              # 托盤圖示與狀態選單
├── marco.js             # 錄製 / 回放核心
├── autoClick.js         # 自動連點核心
├── records.js           # 已錄製清單（選取 / 排序 / 增刪改 / 事件編輯）
├── recordsStore.js      # 檔案 I/O：持久化、備份輪替、匯出 / 匯入
├── store.js             # 渲染端共享響應式狀態
├── App.vue              # 側邊欄 + 自繪標題欄 + 滾動條
├── index.css            # 全域樣式
├── styles/ui.css        # 共用元件樣式
├── core/
│   ├── logger.js        # 統一 logger（含全域例外捕捉、寫入 logs/marco.log）
│   ├── settings.js      # 設定讀寫與數值校驗
│   └── hotkey.js        # 組合鍵比對、按鍵錄製 (capture)、錄製時的按鍵吞掉邏輯
└── views/
    ├── RecordView.vue   # 錄製 / 回放 / 已錄製清單 / 事件編輯
    ├── AutoClickView.vue# 自動連點
    └── SettingsView.vue # 快捷鍵、錄製行為、資料目錄、程式行為
```

## 資料儲存位置

- **設定**：`<userData>/settings.json`
- **本機庫**：`文件/Marco 錄製/records.json`（`Documents` 不可用時回退到 `userData`；可在設定頁改資料夾）
- **備份**：`records.json.bak.1 ~ .N`，份數可在設定頁調整（預設 3 份）
- **匯出檔案**：由使用者選擇位置，預設建議路徑同樣在 `文件/Marco 錄製/`
- **日誌**：`<userData>/logs/marco.log`（超過 512 KB 自動輪替）

## 結束程式時的保護機制

若清單中仍有「未儲存」的錄製，關閉視窗時會彈出確認框：

- **儲存並結束**：先把未儲存的錄製寫入本機再關閉
- **不儲存直接結束**：遺失這些錄製
- **取消**：回到程式

## 原生模組注意事項（robotjs / uiohook-napi）

> 這點目前**維持原狀，請先閱讀底下限制再安裝**。

- `robotjs@0.9.1` 是最後一版（2018 年後未再維護），官方沒有為新版 Node ABI 提供預編好的二進位檔。
  若 `npm install` 失敗或執行時出現 `was compiled against a different Node.js version`，代表需要**本機編譯**：
  - Windows：安裝 `Visual Studio Build Tools`（C++ 桌面開發工作負載）+ Python 3
  - macOS：安裝 Xcode Command Line Tools（`xcode-select --install`）
  - Linux：`apt install build-essential libxtst-dev libpng++-dev`
- `uiohook-napi` 負責全域監聽，`robotjs` 負責模擬輸入，兩者缺一不可。
- 權限：
  - macOS 需在「系統設定 → 隱私權與安全性 → 輔助使用」勾選本程式，否則快捷鍵完全無反應。
  - Linux 需要具備 input 裝置讀取權限（通常要加入 `input` 群組或以 root 執行）。
  - Windows 建議以與目標程式相同的權限層級執行；若目標程式以管理員身分執行，本程式也要用管理員開啟。
- 若日後要替換 `robotjs`，可評估 `@nut-tree/nut-js`（活躍維護，但 API 與延遲特性不同，需調整 `marco.js` / `autoClick.js`）。

## 建置與打包

```bash
npm run package    # 只打包到 out/（不產生安裝檔）
npm run make:win   # Windows：MSI 安裝檔 + 免安裝 ZIP
npm run make:mac   # macOS：ZIP
npm run make:linux # Linux：deb / rpm（需在 Linux 上執行）
```

### Windows 安裝檔：可自行選擇安裝位置

`make:win` 產出：

- `out/make/wix/x64/Marco-1.0.0.msi`：安裝精靈會顯示**安裝目錄選擇頁**，可改到 `D:\...` 等任意路徑。
- `out/make/zip/win32/x64/Marco-win32-x64-1.0.0.zip`：免安裝版，解壓縮到哪裡就裝在哪裡。

> 原本使用 Squirrel 的 `Setup.exe`（雙擊即靜默安裝到 `%LOCALAPPDATA%\Marco`，無法選路徑），
> 已改為 WiX MSI。若仍想要一鍵靜默安裝版，可在 `forge.config.js` 的 `makers` 加回
> `@electron-forge/maker-squirrel`。

**產出 MSI 需要本機安裝 WiX Toolset v3**（只需一次）：

```bash
choco install wixtoolset          # 或至 https://wixtoolset.org/releases/ 下載 WiX v3 安裝
```

`forge.config.js` 會自動偵測 `candle.exe`；找不到時會印出提示並**只產出免安裝 ZIP**，
不會讓 `make:win` 直接失敗。

`deb` / `rpm` 的 maker 只能在 Linux 平台上產出，因此不分平台的 `npm run make` 在非 Linux 環境會失敗，請改用上面的分平台指令。

托盤圖示透過 `packagerConfig.extraResource` 附上（`resources/build/icon.png`），打包後才能正常顯示。

## 其他指令

```bash
npm run lint       # ESLint 檢查
npm run gen:icon   # 由既有圖示產生 build/icon.ico
```
