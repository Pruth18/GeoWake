# GeoWake

A location-based alarm for commuters. Pick a destination on a map, set an alert radius, and
your phone wakes you when you arrive — so you can sleep, read, or zone out without missing
your stop.

Android-first. No backend, no account, no data leaves your device.

## Status

Migrating from a foreground-only MVP to a production Android release.

| | |
|---|---|
| Expo SDK | 57 (RN 0.86.2, React 19.2.3) |
| Health | `expo-doctor` 21/21, `tsc --noEmit` clean |
| Works today | Map, destination picking, saved locations, settings |
| Not yet working | **Background alarm** — fires only while the app is foregrounded |

The background geofencing that makes the app actually useful is Phase 3. See
[`docs/SETUP.md`](docs/SETUP.md) for what has to exist before the first on-device build.

## Getting started

```sh
npm install
npx expo run:android      # requires Android SDK + a Google Maps key, see docs/SETUP.md
```

`npx expo start` alone is **not** enough for the alarm work: background location does not
function in Expo Go, so a development build is required.

```sh
npm run typecheck    # tsc --noEmit
npm test             # jest
npm run doctor       # expo-doctor
```

## How it works

```
index.ts ──▶ src/App.tsx ──▶ src/navigation/AppNavigator
                                   │
              ┌────────────────────┼────────────────────┐
            Home ──▶ Map ──▶ Alarm                  Settings
         (saved      (pick a      (arrival
          places)     point +      monitoring)
                      radius)
```

Destinations live in AsyncStorage as `{ id, name, address, latitude, longitude, radius }`.
Arrival detection uses Android's native Geofencing API via `expo-location` +
`expo-task-manager` — not a continuous location stream, which would drain the battery and,
since 2026-08-26, no longer qualifies for a Play foreground-service declaration.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture constraints and conventions
- [`docs/SETUP.md`](docs/SETUP.md) — toolchain, API keys, store accounts
- [`docs/privacy-policy.md`](docs/privacy-policy.md) — draft policy (hosting required for Play)

## License

Not currently licensed for redistribution.
