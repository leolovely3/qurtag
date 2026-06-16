# QurTag — mobile (Expo)

A thin WebView wrapper around `https://app.qurtag.com` with native modules for
push, Wallet, NFC, and (eventually) Live Activities.

## Setup

```bash
cd mobile
npm install
npx expo start
```

Open Expo Go on a real device or run on the iOS Simulator.

## Build

```bash
npm install -g eas-cli
eas login
eas build -p ios --profile preview
```

## What lives here vs in `/src`

The web app at `/src` is canonical. This wrapper only adds capabilities the
web can't reach: APNs/FCM push, Apple Wallet, NFC, Live Activities.

See [docs/MOBILE.md](../docs/MOBILE.md) for the full strategy.
