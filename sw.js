// Get Jacked service worker: offline app shell + notification taps.
const VERSION = "get-jacked-v7";
// Exercise photos (generated from images.js; tests check they match).
const IMAGES = ["./img/ex/ball-leg-curl.webp", "./img/ex/band-assisted-pull-up.webp", "./img/ex/band-good-morning.webp", "./img/ex/band-pull-apart.webp", "./img/ex/barbell-bench-press-medium-grip.webp", "./img/ex/barbell-full-squat.webp", "./img/ex/barbell-hip-thrust.webp", "./img/ex/bent-arm-dumbbell-pullover.webp", "./img/ex/cable-crossover.webp", "./img/ex/cable-crunch.webp", "./img/ex/cable-rope-overhead-triceps-extension.webp", "./img/ex/cable-seated-lateral-raise.webp", "./img/ex/calf-raise-on-a-dumbbell.webp", "./img/ex/cross-over-with-bands.webp", "./img/ex/crunches.webp", "./img/ex/dip-machine.webp", "./img/ex/dips-chest-version.webp", "./img/ex/dumbbell-bench-press.webp", "./img/ex/dumbbell-flyes.webp", "./img/ex/dumbbell-lunges.webp", "./img/ex/dumbbell-step-ups.webp", "./img/ex/ez-bar-curl.webp", "./img/ex/ez-bar-skullcrusher.webp", "./img/ex/face-pull.webp", "./img/ex/goblet-squat.webp", "./img/ex/hack-squat.webp", "./img/ex/hammer-curls.webp", "./img/ex/hanging-leg-raise.webp", "./img/ex/incline-dumbbell-curl.webp", "./img/ex/incline-dumbbell-press.webp", "./img/ex/inverted-row.webp", "./img/ex/kettlebell-one-legged-deadlift.webp", "./img/ex/lateral-raise-with-bands.webp", "./img/ex/leg-extensions.webp", "./img/ex/leg-press.webp", "./img/ex/lying-dumbbell-tricep-extension.webp", "./img/ex/lying-leg-curls.webp", "./img/ex/lying-t-bar-row.webp", "./img/ex/machine-bench-press.webp", "./img/ex/natural-glute-ham-raise.webp", "./img/ex/one-arm-dumbbell-row.webp", "./img/ex/one-arm-side-laterals.webp", "./img/ex/one-legged-cable-kickback.webp", "./img/ex/pullups.webp", "./img/ex/push-ups-close-triceps-position.webp", "./img/ex/push-ups-with-feet-elevated.webp", "./img/ex/pushups.webp", "./img/ex/reverse-crunch.webp", "./img/ex/reverse-machine-flyes.webp", "./img/ex/romanian-deadlift.webp", "./img/ex/seated-band-hamstring-curl.webp", "./img/ex/seated-bent-over-rear-delt-raise.webp", "./img/ex/seated-cable-rows.webp", "./img/ex/seated-calf-raise.webp", "./img/ex/seated-leg-curl.webp", "./img/ex/side-lateral-raise.webp", "./img/ex/single-leg-glute-bridge.webp", "./img/ex/split-squat-with-dumbbells.webp", "./img/ex/split-squats.webp", "./img/ex/squats-with-bands.webp", "./img/ex/standing-biceps-cable-curl.webp", "./img/ex/standing-cable-chest-press.webp", "./img/ex/standing-calf-raises.webp", "./img/ex/standing-dumbbell-calf-raise.webp", "./img/ex/standing-dumbbell-triceps-extension.webp", "./img/ex/stiff-legged-barbell-deadlift.webp", "./img/ex/stiff-legged-dumbbell-deadlift.webp", "./img/ex/triceps-pushdown-rope-attachment.webp", "./img/ex/triceps-pushdown.webp", "./img/ex/weighted-crunches.webp", "./img/ex/weighted-sissy-squat.webp", "./img/ex/wide-grip-lat-pulldown.webp"];
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./calc.js", "./program.js", "./notify.js", "./state.js", "./images.js", "./media.js", "./stepper.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png", "./icons/badge-96.png",
  "./icons/apple-touch-icon-180.png",
  ...IMAGES,
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Cache first for the shell (works with no signal in the gym), refresh the cache in the background.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === "navigate" ? "./index.html" : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res.ok && req.mode !== "navigate") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    return (await network) || new Response("Offline", { status: 503 });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#/summary", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.navigate?.(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
