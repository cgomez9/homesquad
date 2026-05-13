// Mock dependencies BEFORE importing the module under test
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('i18next', () => {
  const i18nMock: any = {
    use: jest.fn(() => i18nMock),
    init: jest.fn().mockResolvedValue(undefined),
    changeLanguage: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: i18nMock };
});

jest.mock('react-i18next', () => ({ initReactI18next: 'init-react-i18next' }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initI18n, setLanguage, getCurrentLanguagePref } from '../src/i18n';

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedI18n = i18n as unknown as { init: jest.Mock; changeLanguage: jest.Mock };

// Stub Intl.DateTimeFormat().resolvedOptions().locale for deterministic tests.
function mockDeviceLocale(locale: string) {
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    return { resolvedOptions: () => ({ locale } as any) } as any;
  });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('initI18n', () => {
  it('uses stored preference when present', async () => {
    mockedStorage.getItem.mockResolvedValue('es');
    mockDeviceLocale('en-US');
    await initI18n();
    expect(mockedI18n.init).toHaveBeenCalledWith(expect.objectContaining({ lng: 'es' }));
  });

  it('falls back to device locale when no stored preference (es device)', async () => {
    mockedStorage.getItem.mockResolvedValue(null);
    mockDeviceLocale('es-MX');
    await initI18n();
    expect(mockedI18n.init).toHaveBeenCalledWith(expect.objectContaining({ lng: 'es' }));
  });

  it('falls back to device locale when no stored preference (en device)', async () => {
    mockedStorage.getItem.mockResolvedValue(null);
    mockDeviceLocale('en-US');
    await initI18n();
    expect(mockedI18n.init).toHaveBeenCalledWith(expect.objectContaining({ lng: 'en' }));
  });

  it('defaults to en when device locale is not es', async () => {
    mockedStorage.getItem.mockResolvedValue(null);
    mockDeviceLocale('fr-FR');
    await initI18n();
    expect(mockedI18n.init).toHaveBeenCalledWith(expect.objectContaining({ lng: 'en' }));
  });
});

describe('setLanguage', () => {
  it("persists 'es' to storage and calls changeLanguage", async () => {
    await setLanguage('es');
    expect(mockedStorage.setItem).toHaveBeenCalledWith('shores_lang_pref', 'es');
    expect(mockedI18n.changeLanguage).toHaveBeenCalledWith('es');
  });

  it("persists 'en' to storage and calls changeLanguage", async () => {
    await setLanguage('en');
    expect(mockedStorage.setItem).toHaveBeenCalledWith('shores_lang_pref', 'en');
    expect(mockedI18n.changeLanguage).toHaveBeenCalledWith('en');
  });

  it("'system' clears storage and reverts to device locale", async () => {
    mockDeviceLocale('es-AR');
    await setLanguage('system');
    expect(mockedStorage.removeItem).toHaveBeenCalledWith('shores_lang_pref');
    expect(mockedI18n.changeLanguage).toHaveBeenCalledWith('es');
  });
});

describe('getCurrentLanguagePref', () => {
  it("returns 'es' when storage holds 'es'", async () => {
    mockedStorage.getItem.mockResolvedValue('es');
    expect(await getCurrentLanguagePref()).toBe('es');
  });

  it("returns 'en' when storage holds 'en'", async () => {
    mockedStorage.getItem.mockResolvedValue('en');
    expect(await getCurrentLanguagePref()).toBe('en');
  });

  it("returns 'system' when storage is empty", async () => {
    mockedStorage.getItem.mockResolvedValue(null);
    expect(await getCurrentLanguagePref()).toBe('system');
  });
});
