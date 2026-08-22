import Constants from 'expo-constants';

/**
 * Whether the debug affordances are available.
 *
 * app.config.ts sets extra.enableDevTools false for the production EAS profile, so the
 * Debug route is not even registered in a production build.
 *
 * Lives in its own module rather than in AppNavigator: screens need to read it, and
 * importing it from the navigator that imports those screens is a cycle.
 */
export const devToolsEnabled = Constants.expoConfig?.extra?.enableDevTools === true;
