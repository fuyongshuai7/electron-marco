const path = require('node:path');
const fsSync = require('node:fs');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives');

/**
 * WiX MSI 安裝檔需要本機安裝 WiX Toolset v3（提供 candle.exe / light.exe）。
 * electron-wix-msi 只會從 PATH 找工具，因此這裡偵測後自動把 bin 目錄加進本程序 PATH，
 * 使用者不需要手動改環境變數。找不到工具鏈時略過 MSI，避免 make 直接失敗。
 */
function findWixBinDir() {
  const hasCandle = (dir) => {
    try {
      return fsSync.existsSync(path.join(dir, 'candle.exe'));
    } catch {
      return false;
    }
  };
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir && hasCandle(dir)) return dir;
  }
  for (const version of ['3.14', '3.11', '3.10', '3.9']) {
    const dir = `C:\\Program Files (x86)\\WiX Toolset v${version}\\bin`;
    if (hasCandle(dir)) return dir;
  }
  return null;
}

const wixBinDir = findWixBinDir();
const hasWix = !!wixBinDir;
if (hasWix) {
  process.env.PATH = `${wixBinDir}${path.delimiter}${process.env.PATH || ''}`;
  process.env.Path = process.env.PATH;
  console.log(`[Marco] 使用 WiX Toolset：${wixBinDir}`);
} else {
  console.warn(
    '[Marco] 未偵測到 WiX Toolset（candle.exe），已略過 Windows MSI 安裝檔，只會產出免安裝 ZIP。\n' +
      '        安裝方式：choco install wixtoolset，或至 https://wixtoolset.org/releases/ 下載 WiX v3。'
  );
}

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Marco',
    icon: path.resolve(__dirname, 'build', 'icon.ico'),
    // 托盤圖示在 packaged 後取用 process.resourcesPath/build/*
    extraResource: ['build/icon.ico', 'build/icon.png'],
    // plugin-vite 預設只打包 /.vite，會導致 uiohook-napi / robotjs 等原生模組遺失。
    // 這裡改為保留 Vite 產物 + package.json + node_modules（devDependencies 會被 prune 掉）。
    ignore: (file) => {
      if (!file) return false;
      if (file === '/package.json') return false;
      if (file.startsWith('/.vite')) return false;
      if (file.startsWith('/node_modules')) return false;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    // Windows 安裝檔：MSI 會顯示安裝介面並讓使用者選擇安裝目錄
    // （Squirrel 的 Setup.exe 是雙擊即靜默安裝到 %LOCALAPPDATA%，無法選路徑，因此改用 WiX）
    ...(hasWix
      ? [
          {
            name: '@electron-forge/maker-wix',
            platforms: ['win32'],
            config: {
              name: 'Marco',
              exe: 'Marco.exe',
              manufacturer: 'Marco',
              programFilesFolderName: 'Marco',
              shortcutFolderName: 'Marco',
              icon: path.resolve(__dirname, 'build', 'icon.ico'),
              // 顯示安裝精靈，並允許使用者自行指定安裝資料夾
              ui: { enabled: true, chooseDirectory: true },
            },
          },
        ]
      : []),
    {
      // 免安裝版：解壓縮到任意資料夾即可使用（等同自行決定安裝位置）
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // 把 .node 原生二進位從 asar 解包，否則 require 會失敗
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
