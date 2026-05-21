// Global Jest setup. Applies to every test suite.
//
// ThemeProvider transitively imports @react-native-async-storage/async-storage
// (for persisting the theme pref). The package's native code can't run under
// Jest, so we wire in the bundled in-memory mock once here instead of in every
// test file.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
