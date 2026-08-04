import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, LANGUAGES } from './resources';

/**
 * Isolated i18next instance for the FlowDesk Chat V2 feature (F9.3c). English is
 * the default and fallback. The selected language is persisted and also sent to
 * the backend so the AI replies in it.
 */
const STORAGE_KEY = 'fdv2-lang';

const fdv2i18n = i18n.createInstance();
fdv2i18n.use(initReactI18next).init({
  resources,
  lng: (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'en',
  fallbackLng: 'en',
  supportedLngs: LANGUAGES.map((l) => l.code),
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function dirFor(code) {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.dir : 'ltr';
}

export function currentLang() { return fdv2i18n.language || 'en'; }
export function currentDir() { return dirFor(currentLang()); }

export function setLang(code) {
  fdv2i18n.changeLanguage(code);
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
}

export { LANGUAGES };
export default fdv2i18n;
