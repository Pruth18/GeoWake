const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Lets GeoWake's Activity appear over the lock screen and wake the display.
 *
 * WHY THIS IS A PLUGIN AND NOT JUST CONFIG
 * ----------------------------------------
 * expo-notifications has no API for `showWhenLocked` / `turnScreenOn`, and app.config
 * cannot set arbitrary Activity attributes. Verified against SDK 57: there is no
 * full-screen-intent support anywhere in the package, TypeScript or native.
 *
 * WHAT THIS DELIVERS
 * ------------------
 * When the alarm notification is tapped from a locked phone, the alarm screen opens
 * directly over the lock screen and turns the display on, instead of dumping the user
 * at the keyguard and making them unlock before they can silence anything. On a train,
 * half-awake, that difference matters.
 *
 * WHAT THIS DELIBERATELY DOES *NOT* DELIVER
 * -----------------------------------------
 * A true full-screen intent — the alarm-clock behaviour where the Activity launches
 * itself over the lock screen with no tap at all — requires a custom notification
 * builder in native code, because expo-notifications will not build one. That is real
 * native work with no known-good baseline to debug against, so it is deliberately
 * deferred until dogfooding proves the notification path itself is reliable. Building
 * it first would mean debugging a custom native builder and a geofence at the same
 * time, unable to tell which one failed.
 *
 * Two facts to plan around when that work happens:
 *   - If Play does not grant the USE_FULL_SCREEN_INTENT special access, Android
 *     silently downgrades to a heads-up notification. You will get a false "it works"
 *     on your own device where you granted it manually — verify on a second device
 *     with it denied.
 *   - Play auto-grants the access to apps whose core function is setting alarms, which
 *     GeoWake qualifies for on the merits.
 */
const withAlarmActivity = (config) =>
  withAndroidManifest(config, (cfg) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);

    // Show the alarm screen over the keyguard rather than behind it.
    mainActivity.$['android:showWhenLocked'] = 'true';
    // Wake the display when the alarm screen opens.
    mainActivity.$['android:turnScreenOn'] = 'true';

    return cfg;
  });

module.exports = withAlarmActivity;
