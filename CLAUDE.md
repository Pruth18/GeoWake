# GeoWake — Project Instructions

Location-based alarm for commuters. Pick a destination on a map, set a radius, get woken on
arrival. **No backend, no auth, no API** — everything is local to the device.

Fully TypeScript, Expo SDK 57, background geofencing implemented and tested.
Not yet verified on physical hardware — see `docs/TESTING.md`.

## Stack

Expo SDK 57 · React Native 0.86.2 · React 19.2.3 · TypeScript (strict, `allowJs: false`)
· React Navigation v7 stack · react-native-maps · expo-location + expo-task-manager ·
expo-notifications · expo-audio · Sentry (optional) · AsyncStorage · Jest + jest-expo +
@testing-library/react-native · Maestro.

## Architecture constraints — these are not style preferences

1. **`TaskManager.defineTask` must be called in global module scope**, side-effect-imported
   from `index.ts`. A geofence firing boots the JS engine with **no mounted views** — it can
   never live in a hook, effect, or component. Violating this silently breaks the alarm in
   exactly the case the app exists for.
2. **The geofence decision is a pure function**:
   `handleGeofenceEvent(event, state) -> Effect[]`. The task handler is a thin adapter
   (read state → call pure fn → run effects). Keep logic out of the adapter; it is the part
   that cannot be tested without a device.
3. **Location permissions are two-step** — foreground granted first, *then* background.
   Requesting background cold is rejected by both platforms.
4. **`isAndroidForegroundServiceEnabled: false`** on the expo-location plugin. It defaults to
   `true`, which injects `FOREGROUND_SERVICE_LOCATION` and triggers a Play declaration for a
   use case Google stopped approving on 2026-08-26. We use geofencing, not a foreground
   service. The generated manifest must contain no `FOREGROUND_SERVICE_LOCATION`.
5. **Notification channel IDs are versioned** (`geowake-alarm-v1`). Android channels are
   immutable after first creation — changing a sound or importance on an existing id silently
   does nothing.
6. **The channel sound is the primary wake mechanism**, not `expo-audio`. Starting looping
   playback from a headless task with no Activity is fragile and audio focus can be denied.
   In-app audio only sustains the alarm once the Activity is up.
7. **`expo-audio` must not request background playback.** It adds
   `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — the wrong Play category for an alarm, needing its
   own declaration. `recordAudioAndroid` must stay false too, or the manifest asks for the
   microphone. Both are asserted by CI against the generated manifest.
8. **The debug affordances are the E2E seam.** Maestro cannot drive a geofence, so
   `simulateArrival` dispatches through the real handler rather than shortcutting to the
   alarm. Keep it that way or the E2E test stops proving anything.

## Commands

```
npx expo run:android      # dev loop — NOT eas build (native rebuild per plugin change)
npm run typecheck         # tsc --noEmit
npm run lint              # expo lint
npm test                  # jest (213 tests)
npm run test:coverage     # enforces the scoped 80% gate
npm run doctor            # expo-doctor
maestro test .maestro/arrival-alarm.yaml
```

`android/` and `ios/` are gitignored — Continuous Native Generation. A committed native
directory silently stops config-plugin changes from applying.

## Conventions

- `StyleSheet.create()` at module scope; no `React.FC`; no `console.log` in shipped code.
- Query tests by accessible role/label/text, not `testID` where avoidable.
- Never trust data crossing a native or storage boundary — Zod-parse `TaskManager` payloads
  and AsyncStorage reads. Both arrive unvalidated in contexts with no UI to report an error.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`).

## Deliberate deviations from `.claude/rules/`

Two, both intentional. Do not "correct" them in review.

1. **React Navigation, not Expo Router.** `rules/react-native/patterns.md` uses Expo Router in
   all its examples. The Expo Router scaffold was dead code and was deleted; removing it also
   removed an entire major-version migration from the SDK upgrade path. React Navigation v7 is
   the app's real navigator.
2. **Coverage gate is scoped, not global.** `rules/common/testing.md` mandates 80% overall.
   We enforce **80% on `src/services/**` and `src/state/**`** and set no gate on screens. This
   app's risk lives entirely in headless logic that runs with no UI; chasing global coverage
   through brittle map-screen tests would spend effort away from where failures actually occur.

## Known platform gotchas

- Geofences do **not** survive Android reboot or force-stop. Reconcile on app foreground.
- `POST_NOTIFICATIONS` denied on Android 13+ means the alarm is silently dropped and the app
  is never told. Hard-block arming without it.
- Minimum useful radius is ~150m; latency is up to 6 minutes when the device is stationary.
  Default is 500m.
- `adb emu geo fix` takes **longitude first**. Single teleports often won't trigger a
  transition — Play Services wants plausible motion history.
