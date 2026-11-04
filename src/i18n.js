import { createI18n } from 'vue-i18n'
import zhHant from './locales/zh-Hant.json'
import en from './locales/en.json'

export const LOCALES = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
]

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-Hant',
  fallbackLocale: 'zh-Hant',
  messages: {
    'zh-Hant': zhHant,
    en,
  },
})

/** 套用語言（僅接受支援的 locale） */
export function applyLocale(locale) {
  if (LOCALES.some((l) => l.value === locale) && i18n.global.locale.value !== locale) {
    i18n.global.locale.value = locale
  }
}
