const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', 'coverage/**', 'android/**', 'ios/**', 'dist/**', '.expo/**'],
  },
  {
    rules: {
      /**
       * Both promoted to errors deliberately.
       *
       * The MVP's worst bug was a stale closure: an effect with [] deps captured
       * alarmTriggered === false forever, so the alarm re-fired on every position
       * update. exhaustive-deps would have caught it. On an app whose core logic runs
       * headless, a hook bug is invisible until it costs someone their stop.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // No console in shipped code — the persisted event log is the supported channel,
      // and console output is invisible in release builds anyway.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests may log freely and are not shipped. import/first is also wrong here:
    // jest.mock() factories are hoisted above imports, so the mock call has to be
    // written above the import it replaces for the mock to apply at all.
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
    rules: { 'no-console': 'off', 'import/first': 'off' },
  },
];
