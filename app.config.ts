import type { ExpoConfig } from 'expo/config';

/**
 * The Google Maps key is required on Android — without it the map renders a blank grey
 * grid. It is NOT a secret in any meaningful sense: it is extractable from any shipped
 * APK. The real control is restricting it in Google Cloud Console to "Maps SDK for
 * Android" + this package name + the signing SHA-1 fingerprints. Register BOTH the
 * EAS-managed and the Play App Signing SHA-1s — they differ, and a missing one shows up
 * as a silently grey map in production only.
 */
const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY ?? '';

/**
 * Debug affordances (simulate-arrival, geofence event log, registry inspector).
 * On for development and internal/preview builds, stripped from production.
 */
const enableDevTools = process.env.EAS_BUILD_PROFILE !== 'production';

/** Optional. Crash reporting is skipped entirely rather than failing the build. */
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * Only wired in when credentials exist, so a clone without them still builds. Without
 * the plugin the SDK degrades to a no-op rather than failing at startup.
 */
const sentryPlugins: NonNullable<ExpoConfig['plugins']> =
  sentryOrg && sentryProject
    ? [['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }]]
    : [];

const config: ExpoConfig = {
  name: 'GeoWake',
  slug: 'GeoWake',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  // Required for routing a notification tap back into the alarm screen.
  scheme: 'geowake',

  android: {
    // IRREVERSIBLE once published to Play. Confirm before the first store upload.
    package: 'com.pruth.geowake',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#1E3A8A',
    },
    config: {
      googleMaps: { apiKey: googleMapsApiKey },
    },
    permissions: [
      // Location permissions are contributed by the expo-location plugin below.
      // These two are ours and are not plugin-managed:
      'android.permission.POST_NOTIFICATIONS',
      // Lock-screen alarm takeover. Harmless while unused; declared early so the Play
      // special-access declaration can be filed ahead of needing it (it has review latency).
      'android.permission.USE_FULL_SCREEN_INTENT',
    ],
  },

  ios: {
    supportsTablet: true,
    // iOS is a later phase. Background modes and the (unlikely to be granted) critical-alert
    // entitlement are deliberately not configured yet.
  },

  plugins: [
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'GeoWake uses your location to show your position on the map and set your destination.',
        locationAlwaysAndWhenInUsePermission:
          'GeoWake uses your location in the background to sound an alarm when you arrive at your destination, even if the app is closed.',
        isAndroidBackgroundLocationEnabled: true,
        /**
         * MUST stay false. It defaults to TRUE whenever background location is enabled,
         * which injects FOREGROUND_SERVICE_LOCATION into the manifest and triggers Play's
         * foreground-service declaration — for a use case Google stopped approving on
         * 2026-08-26. We use the Geofencing API, which needs no foreground service.
         * Verify with: adb shell dumpsys package com.pruth.geowake | grep FOREGROUND_SERVICE
         */
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#1E3A8A',
      },
    ],
    [
      'expo-notifications',
      {
        /**
         * Bundles the file into res/raw so the notification channel can reference it
         * by BARE FILENAME ("alarm.wav") — a path does not resolve there. The channel
         * sound is the primary wake-up mechanism, not expo-audio: it is played by the
         * system, so it works even when our JS process is not alive to play anything.
         */
        sounds: ['./assets/sounds/alarm.wav'],
      },
    ],
    [
      'expo-audio',
      {
        // Lets the sustained alarm keep playing once the Activity is up and the user
        // has not yet dismissed it.
        microphonePermission: false,
      },
    ],
    ...sentryPlugins,
  ],

  extra: {
    enableDevTools,
    sentryDsn,
  },
};

export default config;
