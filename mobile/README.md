# Crayons Staff mobile app

The website (https://www.crayonstaff.com) inside a native iPhone/Android shell, plus:

- **Push notifications**: when the office publishes changes to your shifts, and an evening reminder when you are covering the other area tomorrow.
- **Break reminder**: 30 minutes after you start a break, a local notification nudges you.
- **Face ID / fingerprint lock** (optional, switched on from the app's Menu).
- **Wallet pass** hand-off: "Add to Apple Wallet" opens in Safari, which knows how to add it.
- Camera scanning works inside the app, so a tablet running the app can be the kiosk.

Built with Expo. Builds happen in Expo's cloud (EAS), so no Mac is required.

## First-time setup (once, on your PC)

```bash
npm install -g eas-cli
cd mobile
npm install
eas login                       # free Expo account at https://expo.dev
eas init                        # links this folder to a project and fills extra.eas.projectId in app.json
```

Push notifications on iOS also need an APNs key: run `eas credentials` once, choose iOS → push notifications → let EAS create and upload the key with your Apple Developer account.

## Build and send to TestFlight

```bash
eas build --platform ios --profile production   # ~15 minutes in the cloud; first run asks to sign in to Apple and creates the certificates
eas submit --platform ios --latest              # uploads to App Store Connect
```

Then in App Store Connect add testers under TestFlight (internal testers get it right away). For the App Store listing itself, use **unlisted distribution** (Apple's form: "Request unlisted app") so the app is only reachable by link.

Android: `eas build --platform android --profile production` then `eas submit --platform android` after creating the app in Google Play Console.

## Configuration

- `extra.siteUrl` in `app.json`: the website the app loads.
- Bundle id `com.crayonstaff.app`. Change it before the first build if you prefer another.
- Server variables (on Vercel): `CRON_SECRET` for the evening reminders; nothing else is needed for push, since Expo's push service relays to Apple and Google.

## How the bridge works

The page detects it is inside the app (`window.ReactNativeWebView`) and exchanges small JSON messages:
`pushToken` (app → page, which registers it at `/api/devices`), `breakStarted` / `breakEnded` (page → app, schedules or cancels the reminder), `openExternal` (page → app), `setLock` (page → app, Face ID on/off).
