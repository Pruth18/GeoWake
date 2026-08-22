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
const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
const enableDevTools = !isProduction;

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

  /**
   * EAS Update, for JS-only hotfixes without a store round-trip.
   *
   * The "appVersion" policy ties an update to the app version it was built against, so
   * an update can never land on a binary with incompatible native code. Getting this
   * wrong is the classic EAS Update failure — a JS bundle pushed to a build whose
   * native modules do not match crashes on launch, and the fix requires a store review.
   *
   * Updates CANNOT change native code, dependencies, permissions or the SDK version,
   * which describes most of the work in this repo. This is insurance, not a strategy.
   */
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    // Never block the splash screen waiting for a download: an alarm app must open
    // instantly, and a slow train-station connection must not delay it.
    fallbackToCacheTimeout: 0,
  },

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
    /**
     * Stripped from the merged manifest. Both come from expo-file-system, pulled in
     * transitively; GeoWake never touches the filesystem, and unused storage
     * permissions are a needless prompt and a needless line on the data safety form.
     */
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      /**
       * Declared by React Native core for its dev-time overlay (redbox, dev menu).
       * Play treats "draw over other apps" as sensitive and GeoWake never uses it —
       * but blocking it in development would break the redbox, so it is stripped from
       * production builds only.
       */
      ...(isProduction ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
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
        microphonePermission: false,
        /**
         * Both default to true, and both were verified against the generated manifest.
         *
         * recordAudioAndroid adds RECORD_AUDIO — a microphone permission on a commuter
         * alarm, which is a privacy red flag to any user who reads the permission list
         * and an awkward line on the Play data safety form. We never record anything.
         *
         * enableBackgroundPlayback adds FOREGROUND_SERVICE +
         * FOREGROUND_SERVICE_MEDIA_PLAYBACK and a mediaPlayback foreground service.
         * That is the wrong Play category for an alarm and would need its own
         * foreground-service declaration. It is also unnecessary here: the SYSTEM plays
         * the notification channel sound, which is the actual wake-up and works with
         * our process dead. expo-audio only sustains the alarm once the Activity is up,
         * so it never needs to play in the background.
         */
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    /**
     * Local plugin: lets the alarm screen appear over the lock screen and turn the
     * display on. See plugins/withAlarmActivity.js for what it deliberately does not
     * do (a true full-screen intent needs native work, deferred until dogfooding).
     */
    './plugins/withAlarmActivity',
    ...sentryPlugins,
  ],

  extra: {
    enableDevTools,
    sentryDsn,
  },
};

export default config;
