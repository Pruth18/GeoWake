# GeoWake — Setup

Everything here has external latency (account verification, billing approval, tool
downloads) and no engineering dependency. Started late, each one blocks a finished build.

---

## 1. Android toolchain — blocks the first on-device build

Currently missing: **Java and the Android SDK.** Node v24.13.1 is already fine (SDK 57
needs 22.13+).

1. Install [Android Studio](https://developer.android.com/studio).
2. During setup, install the **Android SDK**, **SDK Platform-Tools**, and an emulator
   image — the image **must be a Google APIs / Google Play** one. Plain AOSP images have
   no Play Services and therefore **cannot do geofencing at all**, which is the whole app.
3. Set `ANDROID_HOME` to the SDK location (usually
   `C:\Users\pruth\AppData\Local\Android\Sdk`) and add `platform-tools` to `PATH`.
4. Verify: `adb version` and `java -version` both return something.
5. Enable **Windows long paths** before the first native build, or Gradle will fail on
   deep `node_modules` paths:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
     -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
   ```

Use `npx expo run:android` for the day-to-day loop, **not** `eas build`. Every config-plugin
change needs a native rebuild, and EAS free tier is 30 builds/month with queue times.

## 2. Google Maps API key — blocks the first on-device build

The app has never had one. Expo Go supplies its own key, which is why the map works today
and **will render a blank grey grid** the moment we build a dev client.

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. Enable **billing** (there is a free tier, but a card is required).
3. Enable **Maps SDK for Android**.
4. Credentials → Create credentials → API key.
5. Put it in a `.env` file at the repo root (already gitignored):
   ```
   GOOGLE_MAPS_ANDROID_KEY=AIza...
   ```
6. **Restrict it before launch.** The key is extractable from any shipped APK — secrecy is
   not the control. Restrict to *Maps SDK for Android* + package name `com.pruth.geowake`
   + the signing SHA-1. Get SHA-1s from `eas credentials`. Register **both** the
   EAS-managed and the Play App Signing fingerprints; they differ, and a missing one shows
   up as a grey map in production only.

## 3. Play Console account — blocks the internal-testing build (M2)

$25 one-time, **plus identity verification that routinely takes days**. Start now.

1. Register at [Play Console](https://play.google.com/console/signup).
2. Complete identity verification.
3. Create the app listing; set package name to **`com.pruth.geowake`**.

Internal testing (up to 100 testers) has no waiting period. Public production release is
deliberately deferred — personal accounts created after 2023-11-13 need
[12 testers opted in continuously for 14 days](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
before production access. That gate is off our critical path by design.

Still required even for internal testing: privacy policy URL, Data Safety declaration,
content rating, target audience.

## 4. Privacy policy URL — required to submit at all

A draft is at [`privacy-policy.md`](./privacy-policy.md). It needs to be **publicly hosted**
— GitHub Pages on this repo is enough.

> **Check before publishing:** the draft lists `ur.projexo@gmail.com` as the contact. That
> address becomes public on a page anyone can read. Consider a dedicated alias instead.

## 5. Decide the package name — irreversible

Currently `com.pruth.geowake` in `app.config.ts`. **Permanently immutable once published to
Play.** Change it now or accept it forever.

---

## Verify the current state

These work today, with no accounts and no Android SDK:

```sh
npm install
npx tsc --noEmit          # clean
npx expo-doctor           # 21/21
npx expo export --platform android   # bundles
```

Once the Android SDK and Maps key exist, this is the **M1 gate**:

```sh
npx expo run:android
```

M1 passes when the app boots on a physical device, all four screens navigate, and **the map
renders real tiles** — that last one simultaneously proves the Maps key works and that
`react-native-maps` runs under the New Architecture.
