# Get Jacked: installable PWA for maximum muscle mass

Static files only: no build step and no server code. It works offline after the first load.
Data stays on the phone, in localStorage.

## Install on Android (Chrome)
1. Host the folder on any **HTTPS** static host, for example GitHub Pages, Netlify Drop or
   Cloudflare Pages. Service workers and installing need HTTPS; `localhost` also counts as
   secure, for testing.
2. Open the URL in **Chrome** on the phone.
3. Tap **Install app** (top right in the app). If that button doesn't show, use ⋮ menu → **Install app**.
4. Open Get Jacked from the home screen. It runs full screen (standalone) with the dark theme
   colour. Allow notifications during onboarding, or on your first **Finish workout**.

iPhone (minimal): Safari → Share → **Add to Home Screen**. Web notifications need iOS 16.4+
and only work for the home-screen app.

## What's in it
- `manifest.webmanifest`: standalone, theme/background `#111827`, 192/512 "any" and
  "maskable" icons, a start-workout shortcut.
- `sw.js`: caches the app shell (cache-first, refreshed in the background) and handles
  notification taps, which open the summary.
- `calc.js`: all the maths (pure functions, unit tested). `program.js`: the 4-day
  upper/lower split. `notify.js`: permission and `registration.showNotification`, with a
  fallback card.
- Screens: onboarding, Today, Workout, Summary, Why this works, Settings.

## Tests
`npm install && npm test`
- 9 unit tests: post-workout macros, the bulk targets, the calorie floor, weigh-in
  adjustment, autoregulation, notification text, e1RM and set planning.
- Headless Chromium e2e (Pixel 7 emulation, `Notification` mocked, `showNotification`
  spied):
  - the finish flow sends one notification with the computed numbers;
  - permission denied gives the in-app card and no notification;
  - autoregulation runs;
  - "Why this works" shows the calculation and citations;
  - Chrome's installability check passes;
  - the app works offline.
- `node tests/shots.mjs` takes screenshots and also checks a **real, unmocked**
  notification through the service worker.
