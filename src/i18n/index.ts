import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import ne from './ne.json';

/*
 * Bilingual from the first commit (docs/03). Default to `ne` for Nepal, `en`
 * otherwise, always overridable and persisted in localStorage. The <html lang>
 * attribute is kept in sync so screen readers and the Devanagari CSS work.
 */

export const LANGS = ['ne', 'en'] as const;
export type Lang = (typeof LANGS)[number];

function applyLangAttr(lng: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lng);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ne: { translation: ne },
    },
    fallbackLng: 'en',
    supportedLngs: LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'baato_lang',
      caches: ['localStorage'],
    },
  });

applyLangAttr(i18n.language);
i18n.on('languageChanged', applyLangAttr);

export default i18n;
