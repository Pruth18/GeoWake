/**
 * AsyncStorage ships an official in-memory mock. Without it every storage test would
 * need its own stub, and the real module throws outside a native runtime.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
