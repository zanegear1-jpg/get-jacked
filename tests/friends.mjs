// Friends' copies (/ben/, /laychan/): own password, own icon + manifest, own service worker scope, own storage.
// Local by default; `BASE=https://zanegear1-jpg.github.io/get-jacked/ node tests/friends.mjs` runs it against the live site.
import { chromium, devices } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
let BASE = process.env.BASE, server = null;
if (!BASE) {
  const PORT = 8000 + Math.floor(Math.random() * 900) + 100; BASE = `http://localhost:${PORT}/`;
  server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
}
const SHOTS = process.env.SHOTS; // folder to save lock-screen screenshots into
const ok = (name) => console.log("PASS", name);
const { friends } = JSON.parse(fs.readFileSync(ROOT + "friends.json", "utf8"));
const PASSWORDS = { ben: "ben", laychan: "laychan" }; // the test needs the real ones; the app only has the hashes
const browser = await chromium.launch({ channel: "chromium" });

const unlock = async (page, pw) => { await page.fill("#lock-pw", pw); await page.click("#lock-go"); };
try {
  for (const f of friends) {
    const URL0 = BASE + f.slug + "/", others = friends.filter((o) => o.slug !== f.slug);
    const ctx = await browser.newContext({ ...devices["Pixel 7"] }), page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(URL0); await page.waitForSelector("#lock-pw");
    // lock screen shows the friend's car icon
    const icon = await page.locator("#lock img").evaluate((i) => new Promise((r) => { const go = () => r({ src: i.src, w: i.naturalWidth }); i.complete ? go() : (i.onload = go); }));
    assert.equal(icon.src, URL0 + "icons/icon-192.png"); assert.equal(icon.w, 192, "car icon loads");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${f.slug}-lock.png` });
    // wrong passwords (Zane's, the other friend's, nonsense) are rejected
    for (const bad of ["zane", ...others.map((o) => PASSWORDS[o.slug]), "nope"]) {
      await unlock(page, bad); await page.waitForSelector("#lock-err:not([hidden])");
      assert.ok(await page.isVisible("#lock-pw"), `${f.slug}: '${bad}' must not unlock`);
    }
    // right password, any case + spaces, unlocks
    await unlock(page, `  ${PASSWORDS[f.slug].toUpperCase()} `); await page.waitForSelector("#bw");
    // separate storage namespace
    let keys = await page.evaluate(() => Object.keys(localStorage).sort());
    assert.deepEqual(keys, [`${f.slug}:getjacked.unlocked`, `${f.slug}:massplan.v1`], "only this friend's keys");
    await page.fill("#bw", f.slug === "ben" ? "91" : "68"); await page.click("#ob-go"); await page.waitForSelector("#start");
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).profile.bodyweightKg, `${f.slug}:massplan.v1`), f.slug === "ben" ? 91 : 68);
    // shared app code + exercise images come from the root via ../
    await page.click("#start"); await page.waitForSelector(".exhero img");
    const img = await page.locator(".exhero img").evaluate((i) => i.decode().then(() => ({ src: i.src, w: i.naturalWidth }), () => ({ src: i.src, w: 0 })));
    assert.equal(img.src.startsWith(BASE + (f.theme === "falcon" ? "img/ex-orange/" : "img/ex/")), true, img.src); assert.equal(img.w, 512);
    // theme: only the themed friend gets the extra stylesheet; the others keep the plain look
    const sheets = await page.evaluate(() => [...document.styleSheets].map((x) => x.href));
    assert.equal(sheets.some((h) => h?.includes("/themes/")), !!f.theme, `${f.slug} theme stylesheet`);
    if (f.theme) assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".top img")).display), "none", "theme header icon");
    ok(`${f.slug}: car icon on lock screen; wrong passwords rejected; '${PASSWORDS[f.slug]}' (any case) unlocks; storage only under '${f.slug}:'; shared images load`);
    // manifest: own identity, scope and icons
    const man = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); return { href: l.href, json: await (await fetch(l.href)).json() }; });
    assert.equal(man.href, URL0 + "manifest.webmanifest");
    assert.equal(man.json.name, "Get Jacked"); assert.equal(man.json.short_name, "Get Jacked");
    for (const k of ["id", "scope"]) assert.equal(new URL(man.json[k], man.href).href, URL0, k);
    assert.equal(new URL(man.json.start_url, man.href).href, URL0 + "#/today");
    const sizes = await page.evaluate(async (icons) => Promise.all(icons.map(async (ic) => {
      const u = new URL(ic.src, location.href).href, im = new Image(); im.src = u; await im.decode(); return `${ic.purpose}:${im.naturalWidth}x${im.naturalHeight}=${ic.sizes}`;
    })), man.json.icons.map((i) => ({ ...i, src: new URL(i.src, man.href).href })));
    assert.deepEqual(sizes, ["any:192x192=192x192", "any:512x512=512x512", "maskable:192x192=192x192", "maskable:512x512=512x512"]);
    const apple = await page.evaluate(async () => { const im = new Image(); im.src = document.querySelector('link[rel="apple-touch-icon"]').href; await im.decode(); return im.naturalWidth; });
    assert.equal(apple, 180);
    // own service worker, scoped to the folder
    await page.evaluate(() => navigator.serviceWorker.ready);
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r.scope, script: (r.active || r.waiting || r.installing).scriptURL }; });
    assert.equal(sw.scope, URL0); assert.equal(sw.script, URL0 + "sw.js");
    await page.goto(URL0 + "#/today"); await page.reload(); await page.waitForSelector("#start");
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL), URL0 + "sw.js", "page controlled by its own worker");
    // Chrome installability check
    const cdp = await ctx.newCDPSession(page);
    const inst = await cdp.send("Page.getInstallabilityErrors");
    const real = inst.installabilityErrors.filter((e) => e.errorId !== "in-incognito");
    assert.deepEqual(real, [], JSON.stringify(real));
    ok(`${f.slug}: manifest (name 'Get Jacked', id/scope ${new URL(URL0).pathname}, start_url #/today, 192/512 any + maskable, apple-touch 180); own service worker scope; installability check passes`);
    // offline: everything (own files + shared ../ code and images) comes from the friend's cache
    await page.waitForTimeout(500);
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector("#start");
    await page.click("#start"); await page.waitForSelector(".exhero img");
    await page.click('.dots [data-go="2"]'); await page.waitForSelector('.exscreen[data-k="2"] .exhero img');
    assert.equal(await page.locator(".exhero img").evaluate((i) => i.decode().then(() => i.naturalWidth, () => 0)), 512, "image offline");
    await ctx.setOffline(false);
    ok(`${f.slug}: works offline (app + shared images)`);
    // the same phone: Zane's app and the other friend's app stay locked and don't see this data
    await page.goto(BASE); await page.waitForSelector("#lock-pw");
    assert.equal(await page.locator("#lock img").getAttribute("src"), "icons/icon-192.png");
    await unlock(page, PASSWORDS[f.slug]); await page.waitForSelector("#lock-err:not([hidden])");
    await unlock(page, "zane"); await page.waitForSelector("#bw", { timeout: 10000 });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("massplan.v1")).profile), null, "Zane's app starts fresh, no friend data");
    for (const o of others) {
      await page.goto(BASE + o.slug + "/"); await page.waitForSelector("#lock-pw");
      await unlock(page, PASSWORDS[f.slug]); await page.waitForSelector("#lock-err:not([hidden])");
    }
    keys = await page.evaluate(() => Object.keys(localStorage).sort());
    assert.ok(keys.includes(`${f.slug}:massplan.v1`) && keys.includes("massplan.v1") && keys.includes("getjacked.unlocked"));
    assert.ok(!others.some((o) => keys.includes(`${o.slug}:getjacked.unlocked`)), "other friend still locked");
    await page.goto(URL0 + "#/today"); await page.waitForSelector("#start");
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).profile.bodyweightKg, `${f.slug}:massplan.v1`), f.slug === "ben" ? 91 : 68, "friend data untouched by Zane's app");
    assert.deepEqual(errors, [], errors.join("\n"));
    ok(`${f.slug}: same phone as Zane: Zane's app needs 'zane' and starts with its own data; ${others.map((o) => o.slug).join("/")} stays locked; data never mixes`);
    await ctx.close();
  }
  // Zane's app installed first on the phone, then a friend's link opened: the root worker must not hijack /ben/
  { const ctx = await browser.newContext({ ...devices["Pixel 7"] }), page = await ctx.newPage();
    await page.goto(BASE); await unlock(page, "zane"); await page.waitForSelector("#bw");
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller);
    for (const f of friends) {
      await page.goto(BASE + f.slug + "/"); await page.waitForSelector("#lock-pw");
      assert.equal(await page.locator("#lock img").evaluate((i) => i.src), BASE + f.slug + "/icons/icon-192.png");
      await unlock(page, PASSWORDS[f.slug]); await page.waitForSelector("#bw");
      await page.evaluate(() => navigator.serviceWorker.ready);
      assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope), BASE + f.slug + "/");
    }
    await page.goto(BASE); await page.waitForSelector("#bw"); // Zane's app still fine (unlocked, its own onboarding)
    await ctx.close();
    ok("Zane's app installed first: friend links still load their own app, lock and worker; Zane's app unaffected");
  }
  // Xplosiv clearance link on Today in every copy (Zane's root + each friend): right href, opens outside the app,
  // labelled, image loads from the shared img/, and it never overlaps the exercise text at 360 or 390 px
  for (const [who, path, pw] of [["zane", "", "zane"], ...friends.map((f) => [f.slug, f.slug + "/", PASSWORDS[f.slug]])]) {
    for (const width of [360, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), page = await ctx.newPage();
      await page.goto(BASE + path); await unlock(page, pw); await page.waitForSelector("#bw");
      await page.fill("#bw", "90"); await page.selectOption("#days", "4"); await page.click("#ob-go"); await page.waitForSelector("#start");
      const x = await page.$eval(".hero a#xplosiv", (a) => ({ href: a.getAttribute("href"), target: a.target, rel: a.rel, label: a.getAttribute("aria-label"), img: a.querySelector("img").src }));
      assert.deepEqual({ ...x, img: undefined }, { href: "https://xplosiv.nz/clearance.html", target: "_blank", rel: "noopener", label: "Xplosiv clearance deals", img: undefined }, `${who}: link`);
      assert.equal(x.img, BASE + "img/xplosiv-x.svg", `${who}: shared image`);
      const geo = await page.evaluate(async () => {
        const img = document.querySelector("#xplosiv img"); await img.decode();
        const r = document.querySelector("#xplosiv").getBoundingClientRect(), hits = [];
        for (const li of document.querySelectorAll(".hero .exlist li")) {
          const rg = document.createRange(); rg.selectNodeContents(li);
          for (const t of rg.getClientRects()) if (t.right > r.left && t.left < r.right && t.bottom > r.top && t.top < r.bottom) hits.push(li.textContent);
        }
        const lis = [...document.querySelectorAll(".hero .exlist li")].map((l) => l.getBoundingClientRect());
        return { w: img.naturalWidth, h: r.height, hits, top: r.top, li2: lis[1].top, li6: lis[5].bottom, right: r.right, vw: innerWidth };
      });
      assert.ok(geo.w > 0, "X image loads"); assert.ok(geo.h >= 70 && geo.h <= 90, `X ${geo.h}px tall`);
      assert.deepEqual(geo.hits, [], `${who} @${width}px: X overlaps exercise text`);
      assert.ok(geo.top >= geo.li2 - 6 && geo.top < geo.li6, `${who} @${width}px: X level with the first exercises`); assert.ok(geo.right <= geo.vw, "on screen");
      await ctx.close();
    }
  }
  ok(`Xplosiv X on Today in ${["zane", ...friends.map((f) => f.slug)].join("/")}: href https://xplosiv.nz/clearance.html, target _blank rel noopener, labelled, 70-90 px, no overlap with exercise text at 360 + 390 px`);
  console.log("ALL FRIEND TESTS PASSED");
} finally { await browser.close(); server?.kill(); }
