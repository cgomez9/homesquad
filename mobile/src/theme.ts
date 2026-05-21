// Theme tokens — palettes (light + dark) + immutable layout/typography scales.
//
// Light is the historical "Tide Pool" warm shoreline; dark is "Midnight Tide"
// (deep navy/teal). Use the `useTheme()` hook to pull the active palette inside
// components. The `colors` export below is preserved for backward compatibility
// during the migration to useTheme; it always resolves to the light palette.

export type Palette = {
  primary: string;
  primaryDark: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  // strength meter
  strengthVeryWeak: string;
  strengthWeak: string;
  strengthFair: string;
  strengthStrong: string;
  strengthVeryStrong: string;
  // Tide Pool atmosphere (background sun glow + tide arcs + foam)
  atmosphereSun1: string;
  atmosphereSun2: string;
  atmosphereSun3: string;
  atmosphereArc1: string;
  atmosphereArc2: string;
  atmosphereArc3: string;
  atmosphereFoam: string;
  // shadow tint used by elevated surfaces
  shadow: string;
};

export const lightPalette: Palette = {
  primary: '#0EA5A4',
  primaryDark: '#0F766E',
  accent: '#FB7185',
  bg: '#FEFCF7',
  surface: '#FFFFFF',
  text: '#134E4A',
  textMuted: '#5C7A78',
  border: '#D6E5E3',
  success: '#34D399',
  warning: '#F97316',
  error: '#E11D48',
  strengthVeryWeak: '#E11D48',
  strengthWeak: '#F97316',
  strengthFair: '#FACC15',
  strengthStrong: '#34D399',
  strengthVeryStrong: '#0EA5A4',
  atmosphereSun1: 'rgba(249,115,22,0.05)',
  atmosphereSun2: 'rgba(251,113,133,0.08)',
  atmosphereSun3: 'rgba(251,113,133,0.10)',
  atmosphereArc1: 'rgba(14,165,164,0.07)',
  atmosphereArc2: 'rgba(14,165,164,0.16)',
  atmosphereArc3: 'rgba(15,118,110,0.26)',
  atmosphereFoam: 'rgba(52,211,153,0.45)',
  shadow: '#0F766E',
};

export const darkPalette: Palette = {
  primary: '#22D3D2',
  primaryDark: '#0EA5A4',
  accent: '#FB7185',
  bg: '#0B1726',
  surface: '#13243B',
  text: '#E8E8E0',
  textMuted: '#7D8FA5',
  border: '#22324B',
  success: '#34D399',
  warning: '#F59E0B',
  error: '#FB7185',
  strengthVeryWeak: '#FB7185',
  strengthWeak: '#F59E0B',
  strengthFair: '#FBBF24',
  strengthStrong: '#34D399',
  strengthVeryStrong: '#22D3D2',
  atmosphereSun1: 'rgba(249,115,22,0.10)',
  atmosphereSun2: 'rgba(251,113,133,0.12)',
  atmosphereSun3: 'rgba(251,113,133,0.16)',
  atmosphereArc1: 'rgba(34,211,210,0.06)',
  atmosphereArc2: 'rgba(34,211,210,0.14)',
  atmosphereArc3: 'rgba(14,116,144,0.36)',
  atmosphereFoam: 'rgba(110,231,183,0.55)',
  shadow: '#000000',
};

// Legacy export — points at the light palette for any file not yet migrated to
// useTheme(). Once the migration is complete this can be removed.
export const colors: Palette = lightPalette;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 8, md: 12, lg: 14, pill: 999 };

export const typography = {
  fontFamily:    'Nunito_400Regular',
  fontFamilySemi:'Nunito_600SemiBold',
  fontFamilyBold:'Nunito_700Bold',
  h1: 28,
  h2: 22,
  body: 15,
  small: 13,
  tiny: 11,
};

export type ThemeMode = 'light' | 'dark' | 'system';

export { useTheme, ThemeProvider } from './theme/ThemeProvider';
