// Global Jest setup. Applies to every test suite.

// ThemeProvider transitively imports @react-native-async-storage/async-storage
// (for persisting the theme pref). The package's native code can't run under
// Jest, so we wire in the bundled in-memory mock once here instead of in every
// test file.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-audio's asset resolver (createAudioPlayer(require('*.mp3'))) can't run
// under Jest. src/lib/feedback.ts loads it at module scope, so any component
// that imports feedback (e.g. ChoreCard) needs this stub.
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: () => {}, remove: () => {} }),
}));

// Initialize i18next synchronously with the bundled English locale so any
// component test that uses useTranslation/t() sees real translations rather
// than the raw key paths. Spanish bundle is loaded as a fallback resource
// but the active language is 'en' to match existing test expectations.
const i18nModule = require('i18next');
// i18next may ship as ESM-interop (module.default) or as a plain CJS object
const i18n = i18nModule.default ?? i18nModule;
const { initReactI18next } = require('react-i18next');
const en = require('./src/i18n/locales/en.json');
const es = require('./src/i18n/locales/es.json');
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
