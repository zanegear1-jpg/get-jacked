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
- `images.js` + `img/ex/`: one illustration per exercise (all 80, including every swap alternative), generated for Get Jacked in a single style (grey 3D figure, target muscles in blue, dark background); 512 px WebP, cached offline. A muscle icon is the fallback if an image is ever missing.
- Lock screen: password checked against a SHA-256 hash in `app.js` (client-side deterrent only); the device stays unlocked until **Lock app** in Settings.
- Screens: onboarding (or restore a backup), Today (deload card, week summary, macros), Workout
  (Start button, per-set kg/reps/RIR, rest timer that starts on tick with ±15 s and beep/vibrate, swap,
  GO HEAVIER badge, starting-weight helper, calibration-week tip), Summary (post-workout macros, new
  bests, volume changes), Progress (weekly sets vs target, e1RM chart, history), Why this works,
  Settings (days, equipment, experience, calories, weigh-ins, JSON export/import).
- Training days and rest days (`schedule.js`, shared by every copy): recommended days per split
  (3: Mon/Wed/Fri, 4: Mon/Tue/Thu/Fri, 5: Mon/Tue/Thu/Fri/Sat, 6: Mon–Sat), a 7-toggle **Training days**
  row in Settings (count must match the split, Reset to recommended, a gentle back-to-back warning from
  the program's real muscle overlap, abs ignored). On a rest day Today says **Rest day**, shows
  *Next: <session> on <weekday>* and a **Train anyway** button; an M–S week strip sits in the hero.
  The rotation is unchanged: a missed day just moves the next session to the next training day.
  Stored as `profile.schedule` (Mon = 0); profiles without one get the recommended days on load.

## Tests
`npm install && npm test`: unit tests (`tests/calc.test.mjs`, `tests/program.test.mjs`, `tests/schedule.test.mjs`) and a
headless Chromium e2e run (`tests/e2e.mjs`, Pixel 7, notifications mocked) covering the finish flow,
notifications and the denied fallback, offline use, installability, the rest timer (fake clock), swaps,
progression, settings, tracker/chart/history, export/import, v1 migration, deload, calorie goals and
rest days (a fake Wednesday). Browser tests otherwise run on a Monday (`tests/training-day.mjs`) so
they see a training day whatever the real date.
`node tests/shots.mjs` retakes `screenshots/` and checks a real, unmocked notification.

## Friends' copies (/ben/, /laychan/)

- Live: `https://zanegear1-jpg.github.io/get-jacked/ben/` and `.../laychan/`. Each installs as its own app ("Get Jacked", own car icon),
  with its own password (stored only as a SHA-256 hash), its own service worker scope and its own localStorage namespace (`ben:...`),
  so nothing mixes with Zane's app on a shared phone. Zane's app at the root is unchanged (password `zane`, original storage keys).
- Only the per-person files live in the folder: `index.html`, `user.js` (sets `window.GJ_CONFIG`, read by `config.js`),
  `manifest.webmanifest`, `sw.js`, `icons/`. App code, CSS and exercise images are shared from the root via `../` and precached by each folder's worker.
- After changing the app: `npm run build:friends` (tests fail if a folder is stale). New friend: add to `friends.json`, put artwork in
  `friends-src/<slug>-car.jpg`, run `python3 scripts/friend-icons.py <slug>` and `npm run build:friends`.

## Zane's app look + the default for new copies (`themes/jacked`)

- The stock pages live in `template/` (`index.html`, `sw.js`, `manifest.webmanifest`). Zane's root `index.html`, `sw.js`,
  `manifest.webmanifest` and `user.js` are **generated** from `template/` + `friends.json` `"defaultTheme"` by `npm run build:friends`
  (edit `template/`, never the generated root files; tests fail if they are stale). Friend folders are built from `template/` too.
- `"defaultTheme": "jacked"`: Zane's app (no vehicle: recoloured Get Jacked logo, GET JACKED / BUILT TUFF banner, BULK workout tag,
  orange exercise images, falcon home layout via `"base": "falcon"`). Every friend entry **without** `"theme"` gets it, so a new copy
  starts as Zane's app; give it `"theme": "falcon"`/`"hilux"`/... for a car edition, or `"theme": "none"` for the stock look.
- The root `user.js` only sets `theme` + `exImgDir`; Zane's password, storage keys (`massplan.v1`, `getjacked.unlocked`) and lock come
  from the `config.js` defaults, unchanged. Icons are unchanged (manifest: only `theme_color`/`background_color` become `#0a0a0a`).
  The root worker's cache name is `get-jacked-v<N>-jacked-<theme hash>`, so it changes whenever the theme files change.
