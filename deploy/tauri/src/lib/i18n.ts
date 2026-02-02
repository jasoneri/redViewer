import translationsZhCN from '../../src-tauri/i18n/zh-CN.json';
import translationsEnUS from '../../src-tauri/i18n/en-US.json';

export type Locale = 'zh-CN' | 'en-US';

export const translations = {
  'zh-CN': translationsZhCN,
  'en-US': translationsEnUS,
} as const;

/**
 * 获取当前系统语言
 */
export function getSystemLocale(): Locale {
  const lang = navigator.language;
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US';
}

/**
 * 获取指定语言的翻译
 */
export function getTranslations(locale: Locale = getSystemLocale()) {
  return translations[locale];
}
