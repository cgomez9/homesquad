import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import es from './locales/es.json';

const LANG_STORAGE_KEY = 'shores_lang_pref';

// Use Intl.DateTimeFormat for device locale detection. Built into Hermes
// (RN 0.81), so it works in Expo Go, dev-client APKs, and production builds
// without a native module dependency. We only need to know whether the
// device prefers Spanish — full locale data isn't needed.
function deviceLang(): 'en' | 'es' {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    return locale.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export async function initI18n(): Promise<void> {
  let lang: 'en' | 'es';
  try {
    const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    lang = stored === 'en' || stored === 'es' ? stored : deviceLang();
  } catch {
    lang = deviceLang();
  }

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es } },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export async function setLanguage(lang: 'en' | 'es' | 'system'): Promise<void> {
  try {
    if (lang === 'system') {
      await AsyncStorage.removeItem(LANG_STORAGE_KEY);
      await i18n.changeLanguage(deviceLang());
    } else {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
      await i18n.changeLanguage(lang);
    }
  } catch {
    if (lang !== 'system') await i18n.changeLanguage(lang);
    else await i18n.changeLanguage(deviceLang());
  }
}

export async function getCurrentLanguagePref(): Promise<'en' | 'es' | 'system'> {
  try {
    const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
    return 'system';
  } catch {
    return 'system';
  }
}

export default i18n;
