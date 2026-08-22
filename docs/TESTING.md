# Testing GeoWake

The alarm runs headless, on a moving train, on a device nobody is watching. Almost
everything here exists to make that observable.

---

## Before anything else

Background location **does not work in Expo Go**. `npx expo start` alone will not test
the alarm. You need a development build:

```sh
npm install
npx expo run:android      # builds and installs the dev client on a connected device
```

Prerequisites are in [SETUP.md](./SETUP.md): Android SDK, a Google Maps API key in
`.env`, and a physical device or a **Google Play** emulator image. Plain AOSP emulator
images have no Play Services and **cannot do geofencing at all** — the app will look
fine and simply never fire.

---

## Level 0 — the desk test (2 minutes, no travel)

This is the one to run first, and the one that proves the most per minute.

1. Open the app → **Set New Alarm** → tap the map → **Save & set alarm**.
   Grant location "Allow all the time" and allow notifications when asked.
2. Go back → **Debug tools**.
3. Confirm **Task registered: yes** and **Geofencing active: yes**.
4. Tap **Simulate arrival now**.

Expected: the alarm sounds, the phone vibrates, a notification appears, and **Status**
becomes `triggered`. The event log shows `Arrival detected`.

That proves the decision logic, the state machine, notification delivery, the channel,
and the sound — everything except the OS actually detecting a real region crossing.

## Level 1 — the lock-screen test (1 minute, no travel)

**The most important test in this document.** An alarm you verify while staring at the
screen is not an alarm.

1. Debug tools → **Simulate arrival in 30s**.
2. **Lock the phone. Put it face down. Do not touch it.**
3. Wait.

Expected: the phone wakes you from an idle, locked state. Tapping the notification opens
the alarm screen **over the lock screen** without unlocking first.

Repeat this with the app **swiped away from recents** — the alarm must still fire, since
it is the system playing the notification, not our process.

## Level 2 — walk around the block (15 minutes)

1. Debug tools → **Arm a fence at my location**. This drops a 500 m fence where you stand.
2. Walk out past the radius, then back in.
3. Check the event log.

Note the **elapsed time and distance** at which `Arrival detected` appears. Geofence
dwell latency is under 2 minutes while moving but up to **6 minutes when stationary**,
so a fence you never leave properly may take a while.

## Level 3 — the real commute (the only test that counts)

Everything above is a rehearsal. Only a real journey tells you whether the radius is
right at speed.

Each day, record from the event log:

| What to measure | Why |
|---|---|
| Distance from the boundary when it fired | Decides whether 500 m is right, or whether train speed needs more |
| Time between arriving and the alarm | The number that determines whether you miss the stop |
| Whether it fired at all after 20+ min idle | Doze mode is the real adversary |
| Behaviour after swiping the app away | Should be unaffected |
| **Behaviour after a reboot** | See below — this is the known gap |

### The reboot experiment

**Android does not restore geofences across a restart**, and tells the app nothing.

1. Arm an alarm.
2. `adb reboot` (or restart normally).
3. **Do not open GeoWake.**
4. Trigger an arrival — walk into the fence, or use an emulator route.

If the alarm does not fire, that confirms the gap. The app already mitigates it by
re-registering every time it comes to the foreground, so opening the app before you
travel repairs it. Whether it needs a native `BOOT_COMPLETED` receiver is a decision to
make from this measurement, not from assumption — and even a receiver is a partial fix,
since OEM autostart managers kill them anyway.

---

## Emulator testing

Use **Extended Controls → Location → Routes**, not single coordinate pushes.

Two traps:

- **`adb emu geo fix` takes longitude FIRST**, then latitude. Reversed arguments put you
  in the ocean and nothing fires.
- A single teleport frequently will not trigger a transition at all. Play Services wants
  plausible motion history, so play back a route that crosses the boundary at a
  believable speed.

```sh
adb emu geo fix -0.1238 51.5308     # longitude, latitude — in that order
```

---

## Automated tests

```sh
npm test                  # 213 tests
npm run test:coverage     # enforces 80% on src/services and src/lib
npm run typecheck
npm run lint
npm run doctor
```

The suite covers the parts that cannot be observed on a device: the geofence decision
function's whole branch table (stale regions, unidentified regions, repeat arrivals,
malformed payloads), the alarm state machine, storage migration from MVP-shaped data,
and notification channel construction.

E2E, against a dev build with the debug tools:

```sh
maestro test .maestro/arrival-alarm.yaml
```

---

## When it does not fire

Work down this list in order — it is roughly most to least common.

| Check | Where |
|---|---|
| Is notification permission granted? | Debug → **Can deliver notifications**. If no, Android silently discards the alarm and never tells the app. |
| Is location set to **Allow all the time**? | Debug → Location (always). "While using" is not enough. |
| Is the fence actually registered? | Debug → **Task registered** / **Geofencing active** |
| Is battery optimisation killing the app? | Debug → **Open battery settings**. Xiaomi, Oppo, Vivo, Realme and Samsung are the usual offenders. |
| Was the phone rebooted? | Geofences do not survive it. Open the app to re-register. |
| Was the app force-stopped? | Same — and there is no recovery until next launch. |
| Emulator with no Play Services? | AOSP images cannot do geofencing at all. |
| What does the log actually say? | Debug → **Event log**. Written from inside the task; this is the record of what happened while the phone was in your pocket. |

The distinction the log gives you that nothing else can: whether the fence **never
fired**, or fired and the **notification was suppressed**, or fired and was correctly
**ignored** because the alarm was already triggered.
