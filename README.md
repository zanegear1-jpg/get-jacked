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
- `program.js`: exercise library (full gym / dumbbells / home bodyweight + bands) and the split
  generator: 3 days full body, 4 upper/lower, 5 upper/lower + push/pull/legs, 6 PPL ×2. Every major
  muscle ≥2×/week at 10–20 sets/week; direct glute, rear-delt and ab work at 6–12. Novices get easier
  swaps (lat pulldown, assisted dips).
- `calc.js`: all the maths (pure, unit tested): bulk targets whose macros always add up, post-workout
  meal, double progression + "N more reps to go heavier" status, starting-weight helper (Epley),
  rest times, auto-regulation (≤ +1 set per muscle per week), weekly tracker, deload check.
- `state.js`: saved-state migration. The storage key is still `massplan.v1`, so old data carries over.
- `notify.js`: permission + `registration.showNotification`, with a fallback card.
- `sw.js`: offline app shell (cache-first, refreshed in the background), notification taps.
- `media.js`: the only code that renders exercise images (thumbnail, big image on the workout screen, enlarged view, credit). A new image style = new files in `images.js`/`img/ex/` + `IMAGE_STYLE`; no screen changes.
- `stepper.js`: pure helpers for the one-exercise-per-screen workout (position, dot status, swipe).
- Workout: one exercise per screen ("Exercise 3 of 8" + dots, Back / Next exercise, swipe, "All exercises" list); position is saved, the rest timer keeps running across screens, and the last exercise shows the recovery question + Finish workout.
- `images.js` + `img/ex/`: exercise photos (start | finish) from free-exercise-db (public domain, Unlicense), resized to small WebP, cached offline; a muscle icon where there is no good match.
- Lock screen: password checked against a SHA-256 hash in `app.js` (client-side deterrent only); the device stays unlocked until **Lock app** in Settings.
- Screens: onboarding (or restore a backup), Today (deload card, week summary, macros), Workout
  (Start button, per-set kg/reps/RIR, rest timer that starts on tick with ±15 s and beep/vibrate, swap,
  GO HEAVIER badge, starting-weight helper, calibration-week tip), Summary (post-workout macros, new
  bests, volume changes), Progress (weekly sets vs target, e1RM chart, history), Why this works,
  Settings (days, equipment, experience, calories, weigh-ins, JSON export/import).

## Tests
`npm install && npm test`: unit tests (`tests/calc.test.mjs`, `tests/program.test.mjs`) and a
headless Chromium e2e run (`tests/e2e.mjs`, Pixel 7, notifications mocked) covering the finish flow,
notifications and the denied fallback, offline use, installability, the rest timer (fake clock), swaps,
progression, settings, tracker/chart/history, export/import, v1 migration, deload and calorie goals.
`node tests/shots.mjs` retakes `screenshots/` and checks a real, unmocked notification.
