// Reactive theme provider — exposes the active palette + a mode setter via
// useTheme(). Persists the user's pref to AsyncStorage and listens to the
// system color scheme so 'system' mode follows the device live.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightPalette, darkPalette, type Palette, type ThemeMode } from '../theme';

const THEME_STORAGE_KEY = 'shores_theme_pref';

type ThemeContextValue = {
  mode: ThemeMode;                 // user preference
  effective: 'light' | 'dark';     // resolved scheme after applying 'system'
  colors: Palette;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const effective: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = effective === 'dark' ? darkPalette : lightPalette;

  async function setMode(m: ThemeMode) {
    setModeState(m);
    try {
      if (m === 'system') await AsyncStorage.removeItem(THEME_STORAGE_KEY);
      else await AsyncStorage.setItem(THEME_STORAGE_KEY, m);
    } catch {}
  }

  return (
    <ThemeContext.Provider value={{ mode, effective, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Fallback for tests / pre-provider renders: pretend light mode, no-op setter.
  return {
    mode: 'system',
    effective: 'light',
    colors: lightPalette,
    setMode: async () => {},
  };
}
