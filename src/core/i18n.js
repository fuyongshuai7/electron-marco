import { getSettings } from './settings'
import zhHant from '../locales/zh-Hant.json'
import en from '../locales/en.json'

// 主程序專用的極簡翻譯（托盤選單、系統對話框等不經過 Vue 的字串）
const messages = { 'zh-Hant': zhHant, en }

const resolve = (obj, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

export function uiLocale() {
  const locale = getSettings().ui?.locale
  return locale === 'en' ? 'en' : 'zh-Hant'
}

/** 翻譯主程序字串，支援 {name} 形式的參數 */
export function mt(key, params = {}) {
  let text = resolve(messages[uiLocale()], key) ?? resolve(messages['zh-Hant'], key) ?? key
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}
