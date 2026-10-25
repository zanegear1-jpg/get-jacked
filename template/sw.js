// Get Jacked service worker: offline app shell + notification taps.
const VERSION = "get-jacked-v12";
// Exercise photos (generated from images.js; tests check they match).
const IMAGES = ["./img/ex/assistdip.webp", "./img/ex/bandabd.webp", "./img/ex/bandbicurl.webp", "./img/ex/bandcurl.webp", "./img/ex/bandfly.webp", "./img/ex/bandgm.webp", "./img/ex/bandlat.webp", "./img/ex/bandpress.webp", "./img/ex/bandpulldown.webp", "./img/ex/bandpushdown.webp", "./img/ex/bandrow.webp", "./img/ex/bandsquat.webp", "./img/ex/bench.webp", "./img/ex/bss.webp", "./img/ex/bwcalf.webp", "./img/ex/bwpullup.webp", "./img/ex/bwsplit.webp", "./img/ex/cablecrunch.webp", "./img/ex/cablecurl.webp", "./img/ex/cablefly.webp", "./img/ex/cablekick.webp", "./img/ex/cablelat.webp", "./img/ex/cablerow.webp", "./img/ex/crunch.webp", "./img/ex/csrow.webp", "./img/ex/dbbench.webp", "./img/ex/dbcalf.webp", "./img/ex/dbcrunch.webp", "./img/ex/dbcurl.webp", "./img/ex/dbfly.webp", "./img/ex/dbhipthrust.webp", "./img/ex/dblunge.webp", "./img/ex/dbohtri.webp", "./img/ex/dbpullover.webp", "./img/ex/dbrdl.webp", "./img/ex/dbrearfly.webp", "./img/ex/dbrow.webp", "./img/ex/dbskull.webp", "./img/ex/deficitpushup.webp", "./img/ex/diamond.webp", "./img/ex/dip.webp", "./img/ex/ezcurl.webp", "./img/ex/facepull.webp", "./img/ex/gobletsq.webp", "./img/ex/hack.webp", "./img/ex/hammer.webp", "./img/ex/hipthrust.webp", "./img/ex/hlr.webp", "./img/ex/inclinecurl.webp", "./img/ex/inclinedb.webp", "./img/ex/invrow.webp", "./img/ex/latraise.webp", "./img/ex/leanlat.webp", "./img/ex/legext.webp", "./img/ex/legpress.webp", "./img/ex/lyingcurl.webp", "./img/ex/machlat.webp", "./img/ex/machpress.webp", "./img/ex/nordic.webp", "./img/ex/ohtri.webp", "./img/ex/pullapart.webp", "./img/ex/pulldown.webp", "./img/ex/pullup.webp", "./img/ex/pushdown.webp", "./img/ex/pushup.webp", "./img/ex/rdl.webp", "./img/ex/revcrunch.webp", "./img/ex/revfly.webp", "./img/ex/seatcalf.webp", "./img/ex/seatedcurl.webp", "./img/ex/sissy.webp", "./img/ex/skull.webp", "./img/ex/sldl.webp", "./img/ex/slhipthrust.webp", "./img/ex/slidercurl.webp", "./img/ex/slrdl.webp", "./img/ex/squat.webp", "./img/ex/standcalf.webp", "./img/ex/stepup.webp", "./img/ex/ytraise.webp"];
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./calc.js", "./program.js", "./notify.js", "./state.js", "./schedule.js", "./images.js", "./media.js", "./stepper.js", "./config.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png", "./icons/badge-96.png",
  "./icons/apple-touch-icon-180.png", "./img/xplosiv-x.svg",
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
  // Navigations to this app's own page get the cached index.html. Pages in sub-folders (the friends' copies,
  // e.g. ./ben/) are left to the network: they have their own service worker and must never get this index.
  const scopePath = new URL("./", self.location).pathname, path = new URL(req.url).pathname;
  if (req.mode === "navigate" && path !== scopePath && path !== scopePath + "index.html") return;
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
