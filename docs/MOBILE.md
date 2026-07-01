# QurTag — mobile strategy

The web app is the canonical product. Mobile is a delivery surface that
unlocks three things the web can't:

1. Reliable **Web Push** on iOS (Apple gates this behind home-screen install
   on the web; a real app gets it for free).
2. **Live Activities** on iOS for lost mode — a calmly pulsing item card on
   the lock screen and Dynamic Island while a scan unfolds in real time.
3. **NFC tap-to-write** for tag provisioning, where the iOS web app's NFC
   support is limited.

We don't need a second codebase to get there. The plan: a thin Expo wrapper
that loads the production web app, plus a small set of native modules for
the things the web can't do.

## Architecture

```
QurTag web (Vite + React + Supabase)
    ↑           ↑
    │           │ same domain, same code
    │           │
QurTag iOS    QurTag Android
(Expo)       (Expo)
    │           │
    └───────────┴─── native modules:
                     - Push (Apple/Google)
                     - Live Activity (iOS, Swift)
                     - NFC read/write
                     - Apple Wallet add-to-wallet
                     - Background location for geofenced lost mode
```

The wrapper is a `react-native-webview` rendering `https://app.qurtag.com`,
with a thin bridge that exposes native capabilities back to the web app via
`postMessage`. Whenever the web detects it's in the wrapper, it routes
those calls through the bridge instead of the browser equivalents.

## The /mobile directory

A scaffolded Expo project lives at [`/mobile`](../mobile/) (sibling to the
web `src/`). It is intentionally minimal:

- `app.json` — Expo config, QurTag name + icon, scheme `qurtag://`, bundle id
  `co.qurtag.com`.
- `eas.json` — EAS Build profiles (development / preview / production).
- `App.tsx` — WebView shell with the bridge.
- `package.json` — Expo SDK 53+, react-native-webview, expo-notifications.

### Running it

```bash
cd mobile
npm install
npx expo start
```

For a real build (TestFlight / Internal Testing):

```bash
npm install -g eas-cli
eas login
eas build -p ios --profile preview
eas build -p android --profile preview
```

## Native modules — the order to build them

### 1. Push (week 1)
- Expo Notifications gives APNs + FCM out of the box.
- Register the device token on app launch, POST it to
  `https://app.qurtag.com/api/devices` (or to Supabase directly with the
  user's JWT).
- Update the `send-push` Edge Function to dispatch via APNs/FCM in addition
  to Web Push subscriptions.

### 2. Apple Wallet add-to-wallet (week 1–2)
- `react-native-passkit-wallet` or our own `expo-modules-core` native module
  that wraps `PKAddPassesViewController`.
- Hits the `issue-apple-pass` Edge Function, downloads the `.pkpass`, hands
  it to Wallet.

### 3. NFC tap-to-write (week 2–3)
- `react-native-nfc-manager`.
- During tag activation, the wrapper writes the finder URL to the NFC chip
  on Pro and Signature tier tags.

### 4. Live Activities (week 3–4)
- Native Swift module (`ActivityKit`).
- Activity surfaces: lost-mode armed, scan received, reward released.
- Compact view in the Dynamic Island; expanded view shows the last scan
  location preview.

### 5. Background location for geofenced lost mode (week 4)
- `expo-location` background updates.
- When the user leaves their configured home geofence, the configured tags
  auto-arm with the next-scan-uses-trip-mode context.

## Web ↔ native bridge

In the web (when running inside the wrapper), call:

```ts
if (window.qurtagBridge) {
  window.qurtagBridge.addToWallet(passUrl);
  window.qurtagBridge.registerPushToken(token);
  window.qurtagBridge.startLiveActivity({ itemId, kind: 'armed' });
}
```

The wrapper injects `qurtagBridge` via WebView's `injectedJavaScriptBefore
ContentLoaded`. Each method is just `window.ReactNativeWebView.postMessage`
with a typed envelope, and the React Native side switches on the envelope.

## App Store path

1. Apple Developer Program enrollment ($99/yr).
2. Create Pass Type IDs for the QurTag item pass.
3. Submit a privacy nutrition label that mirrors the bridge architecture:
   "We collect zero finder PII; we collect owner email and item metadata only."
4. App Tracking Transparency: not needed for our use case (no third-party
   tracking).
5. Push entitlement: handled by Expo Notifications.
6. ITP / cookie issues: not relevant; the WebView keeps its own storage.

## Why not full React Native?

The web app is two months of work and growing. Rebuilding every screen in
React Native would (a) take six months, (b) require two skill sets in
parallel, (c) duplicate every future product change.

The WebView wrapper:
- Ships in days, not months.
- Inherits every web-side product change automatically.
- Loses zero capability because of the bridge — NFC, Wallet, Live Activity,
  Push all work native.
- Trades only a tiny amount of "feels native" UX. Linear, Notion, Things,
  Arc all ship WebView-wrapped experiences in part of their product without
  complaints.

Reassess this in a year. If signal says we need a fully native iOS feel,
port the most-used surfaces (item detail, inbox, finder) one at a time and
keep the WebView for everything else.
