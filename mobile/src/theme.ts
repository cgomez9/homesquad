// Design tokens for M7.5. Imported directly by components — no provider,
// no context, no hooks. Update values here; styles re-render automatically
// because StyleSheet.create runs at module load and styles aren't memoized
// per-render. (Avoid mutating these objects at runtime.)

export const colors = {
  primary: '#0EA5A4',          // teal
  primaryDark: '#0F766E',      // darker teal for pressed state
  accent: '#FB7185',           // coral
  bg: '#FEFCF7',               // sand neutral background
  surface: '#FFFFFF',          // card / input background
  text: '#134E4A',             // deep teal-leaning text
  textMuted: '#5C7A78',         // secondary text
  border: '#D6E5E3',           // subtle border
  success: '#34D399',          // seafoam
  warning: '#F97316',          // sunset
  error: '#E11D48',            // deep coral
  // strength meter:
  strengthVeryWeak: '#E11D48',
  strengthWeak: '#F97316',
  strengthFair: '#FACC15',
  strengthStrong: '#34D399',
  strengthVeryStrong: '#0EA5A4',
};

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
