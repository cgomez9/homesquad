import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import es from './locales/es.json';

const LANG_STORAGE_KEY = 'shores_lang_pref';

function deviceLang(): 'en' | 'es' {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === 'es' ? 'es' : 'en';
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
