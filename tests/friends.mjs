// Friends' copies (/ben/, /laychan/): own password, own icon + manifest, own service worker scope, own storage.
// Local by default; `BASE=https://zanegear1-jpg.github.io/get-jacked/ node tests/friends.mjs` runs it against the live site.
import { chromium, devices } from "playwright";
import { onTrainingDay, mondayNow } from "./training-day.mjs";
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
// effective theme: friends.json "defaultTheme" (= Zane's app, "jacked") for entries without "theme"; "none" = stock look
const { themeOf, defaultTheme } = await import("../scripts/build-friends.mjs");
const PASSWORDS = { ben: "ben", laychan: "laychan" };
// falcon look = the falcon theme itself or a theme built on it (theme.json "base": "falcon", e.g. Ben's hilux)
const themeJson = (n) => JSON.parse(fs.readFileSync(ROOT + `themes/${n}/theme.json`, "utf8"));
const falconLook = (f) => { const t = f.slug === "zane" ? defaultTheme : themeOf(f); return !!t && (t === "falcon" || themeJson(t).base === "falcon"); };
// every copy on the site: Zane's root app + the friends (Zane's root uses the default theme, keeps his own password + unprefixed storage)
const ZANE = { slug: "zane", path: "", pw: "zane", prefix: "", theme: defaultTheme };
const COPIES = [ZANE, ...friends.map((f) => ({ ...f, path: f.slug + "/", pw: PASSWORDS[f.slug], prefix: f.slug + ":", theme: themeOf(f) }))];
// per-theme home art + workout-page pill tag
const ART = {
  falcon: { dir: "themes/falcon/", top: "Get Jacked · G6E Falcon Edition", built: "Built different · G6E Falcon", pill: "G6E" },
  hilux: { dir: "themes/hilux/", top: "Get Jacked · Hilux Edition", built: "Built different · Toyota Hilux", pill: "Hilux" },
  jacked: { dir: "themes/jacked/", top: "Get Jacked", built: "Get Jacked · Built tuff", pill: "BULK" }, // Zane's app + default for new copies: no vehicle
}; // the test needs the real ones; the app only has the hashes
const browser = await chromium.launch({ channel: "chromium" });
const rawContext = onTrainingDay(browser); // pages run on a Monday (a training day); see tests/training-day.mjs

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
    assert.equal(img.src.startsWith(BASE + (falconLook(f) ? "img/ex-orange/" : "img/ex/")), true, img.src); assert.equal(img.w, 512);
    // theme: only the themed friend gets the extra stylesheet; the others keep the plain look
    const sheets = await page.evaluate(() => [...document.styleSheets].map((x) => x.href));
    assert.equal(sheets.some((h) => h?.includes("/themes/")), !!themeOf(f), `${f.slug} theme stylesheet`);
    if (themeOf(f)) assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".top img")).display), "none", "theme header icon");
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
      if (falconLook(COPIES.find((x) => x.slug === who))) { // Laychan/Ben (falcon look): the link is the Supplements box, not a floated X
        const t = await page.evaluate(async () => {
          const a = document.querySelector(".fx-tiles a#xplosiv.fx-tile.t-x"), img = a?.querySelector("img.fx-xi"); if (img) await img.decode();
          const r = a?.getBoundingClientRect();
          return a && { href: a.getAttribute("href"), target: a.target, rel: a.rel, label: a.getAttribute("aria-label"), img: img.src, w: img.naturalWidth, text: a.querySelector("strong").textContent + " / " + a.querySelector("span").textContent,
            floated: document.querySelectorAll(".hero .xpw, .hero #xplosiv, .fx-below #xplosiv").length, n: document.querySelectorAll("#xplosiv").length, right: r.right, vw: innerWidth };
        });
        assert.ok(t, `${who}: Supplements box links to Xplosiv`);
        assert.deepEqual({ href: t.href, target: t.target, rel: t.rel, label: t.label }, { href: "https://xplosiv.nz/clearance.html", target: "_blank", rel: "noopener", label: "Xplosiv clearance deals" }, `${who}: box link`);
        assert.equal(t.img, BASE + "img/xplosiv-x.svg", `${who}: shared X image as the icon`); assert.ok(t.w > 0, "X icon loads");
        assert.equal(t.text, "Supplements / Xplosiv clearance"); assert.equal(t.floated, 0, `${who}: no floated X in the exercise list`); assert.equal(t.n, 1);
        assert.ok(t.right <= t.vw, "on screen"); await ctx.close(); continue;
      }
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
  ok(`Xplosiv on Today in ${["zane", ...friends.map((f) => f.slug)].join("/")}: href https://xplosiv.nz/clearance.html, target _blank rel noopener, labelled; floated X (70-90 px, no overlap with exercise text) in the stock copies (${COPIES.filter((c) => !falconLook(c)).map((c) => c.slug).join("/") || "none"}), Supplements box (no floated X) in ${COPIES.filter(falconLook).map((f) => f.slug).join("/")}, at 360 + 390 px`);
  // Laychan's home v4 (themes/falcon/theme.js): live hero text + chips from the next session, real Start/Resume button,
  // four boxes (Workouts/Progress/Cheat meals/Supplements) + gear link, five-tab nav with icons; unthemed copies keep the stock Today page
  for (const f of COPIES.filter(falconLook)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), page = await ctx.newPage();
    await page.goto(BASE + f.path); await unlock(page, f.pw); await page.waitForSelector("#bw");
    await page.fill("#bw", "90"); await page.selectOption("#days", "4"); await page.selectOption("#equip", "full"); await page.click("#ob-go"); await page.waitForSelector("#start");
    const h = await page.evaluate(() => ({ h1: document.querySelector(".fx-hero h1").textContent, chips: [...document.querySelectorAll(".fx-chips li")].map((l) => l.textContent),
      start: document.querySelector("#start").textContent.trim(), startIn: !!document.querySelector(".fx-home > #start"), n: document.querySelectorAll("#start").length,
      tiles: [...document.querySelectorAll(".fx-tiles > .fx-tile")].map((a) => [a.tagName, a.getAttribute("href"), a.querySelector("strong").textContent, !!a.querySelector("b"), !!a.querySelector("i, img")]),
      grid: (() => { const r = [...document.querySelectorAll(".fx-tiles > .fx-tile")].map((a) => a.getBoundingClientRect()); return [r[0].top === r[1].top, r[2].top === r[3].top, r[2].top > r[0].bottom, r[0].left === r[2].left, Math.abs(r[0].width - r[1].width) < 1]; })(),
      builtAfter: document.querySelector(".fx-tiles").compareDocumentPosition(document.querySelector(".fx-built")) === Node.DOCUMENT_POSITION_FOLLOWING, gear: document.querySelector(".fx-gear").getAttribute("href"),
      art: [...document.querySelectorAll(".fx-art img, img.fx-art")].map((i) => i.complete && i.naturalWidth > 0), oldTop: getComputedStyle(document.querySelector(".top")).display,
      nav: [...document.querySelectorAll("#nav a")].map((a) => [a.textContent, getComputedStyle(a, "::before").maskImage !== "none" || getComputedStyle(a, "::before").webkitMaskImage !== "none"]),
      font: document.fonts.check("20px Knewave"),
      arts: [...document.querySelectorAll(".fx-top img, .fx-hero > img, img.fx-built")].map((i) => [i.getAttribute("src").replace(/^.*?(themes\/)/, "$1"), i.alt]),
      body: document.body.className }));
    const A = ART[f.theme];
    if (f.slug === "zane") { // Zane's own keys and lock untouched by the new look
      const keys = await page.evaluate(() => Object.keys(localStorage).sort());
      assert.deepEqual(keys, ["getjacked.unlocked", "massplan.v1"], "zane: same storage keys as before");
    }
    assert.deepEqual(h.arts, [[A.dir + "home-top.webp", A.top], [A.dir + "home-hero.webp", ""], [A.dir + "home-built.webp", A.built]], `${f.slug}: own home art + alt text`);
    assert.ok(h.body.split(" ").includes("theme-falcon"), `${f.slug}: full falcon styling (body.theme-falcon)`);
    assert.equal(h.h1, "Today: Upper A"); assert.deepEqual(h.chips, ["4 sets", "6–10 reps", "RIR 1–2", "rest 3 min"], "chips = first exercise (bench)");
    assert.equal(h.start, "Start workout"); assert.ok(h.startIn && h.n === 1, "one real #start in the home layout");
    assert.deepEqual(h.tiles, [["A", "#/workout", "Workouts", true, true], ["A", "#/progress", "Progress", true, true], ["BUTTON", null, "Cheat meals", true, true], ["A", "https://xplosiv.nz/clearance.html", "Supplements", true, true]], "four boxes");
    assert.deepEqual(h.grid, [true, true, true, true, true], "2x2 grid"); assert.ok(h.builtAfter, "Built Different banner below the grid"); assert.equal(h.gear, "#/settings"); assert.deepEqual(h.art, [true, true, true], "artwork loads");
    assert.equal(h.oldTop, "none", "artwork replaces the header on Today");
    assert.deepEqual(h.nav, [["Today", true], ["Workout", true], ["Progress", true], ["Why", true], ["Settings", true]]);
    // compact boxes: the whole Built Different banner sits above the bottom nav on the first screen; box subtitle and chevron don't overlap
    for (const [w, ht] of [[390, 844], [360, 780]]) {
      await page.setViewportSize({ width: w, height: ht }); await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; }); await page.waitForTimeout(150);
      const fit = await page.evaluate(() => { const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return { built: document.querySelector(".fx-built").getBoundingClientRect().bottom, nav: document.querySelector("#nav").getBoundingClientRect().top,
          overlap: [...document.querySelectorAll(".fx-tile")].some((t) => { const c = t.querySelector("b").getBoundingClientRect(); return [...t.querySelectorAll("strong, span")].some((x) => ov(x.getBoundingClientRect(), c)); }) }; });
      assert.ok(fit.built <= fit.nav, `banner fully above the nav at ${w}x${ht} (${fit.built} > ${fit.nav})`); assert.ok(!fit.overlap, `box text clear of the chevron at ${w}x${ht}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(".fx-gear"); await page.waitForFunction(() => location.hash === "#/settings");
    await page.click('#nav a[href="#/today"]'); await page.click(".fx-tile.t-p"); await page.waitForFunction(() => location.hash === "#/progress");
    await page.click('#nav a[href="#/today"]'); await page.click(".fx-tile.t-w"); await page.waitForFunction(() => location.hash === "#/workout");
    // Cheat meals sheet: opens from the box, 9 meal cards with pictures, closes with the X, Escape, the backdrop and back
    const mealsOpen = async () => { await page.click(".fx-tile.t-c"); await page.waitForSelector(".fx-sheet.open [role=dialog]"); };
    const closed = () => page.waitForFunction(() => !document.querySelector(".fx-sheet") && !document.documentElement.classList.contains("fx-noscroll"));
    await page.click('#nav a[href="#/today"]'); await mealsOpen();
    const m = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll(".fx-meals > li.fx-meal")];
      await Promise.all(cards.map((c) => { const i = c.querySelector("img"); i.loading = "eager"; return i.decode().catch(() => {}); }));
      const L = document.querySelector(".fx-meals");
      return { h: document.querySelector("#fx-meals-h").textContent, sub: document.querySelector(".fx-sheet header p").textContent, focus: document.activeElement.className,
        cards: cards.map((c) => [c.querySelector("h3").textContent, c.querySelector(".pt strong").textContent, getComputedStyle(c.querySelector(".pt strong")).color, c.querySelector("img").naturalWidth > 0]),
        need: cards.map((c) => c.querySelector(".need").textContent), tips: cards.filter((c) => c.querySelector(".tip")).length,
        badge: [...document.querySelectorAll(".fx-badge")].map((b) => [b.textContent, b.closest("li").querySelector("h3").textContent]),
        scrolls: L.scrollHeight > L.clientHeight && getComputedStyle(L).overflowY === "auto", hash: location.hash };
    });
    assert.equal(m.h, "Cheat meals"); assert.equal(m.sub, "Fast high-protein meals when there's no time to cook"); assert.equal(m.focus, "fx-x", "focus on the close X");
    assert.deepEqual(m.cards.map((c) => c[0]), ["1. Chicken and microwave rice", "2. High-protein yoghurt", "3. Protein shake", "4. Pre-boiled eggs", "5. Chicken straight from the fridge", "6. Eggs and baked beans", "7. Eggs on toast", "8. Beans on toast", "9. Eggs and beans on toast"], "9 meals in order");
    assert.deepEqual(m.cards.map((c) => c[1]), ["~30–45 g protein", "~25–40 g protein", "~40–55 g protein", "~25 g protein per 4 eggs", "~35–50 g protein", "40–45 g protein", "30–34 g protein", "18–23 g protein", "30–35 g protein"]);
    assert.ok(m.cards.every((c) => c[2] === "rgb(255, 121, 0)" && c[3]), "protein in orange, every picture loads");
    assert.equal(m.need[5], "4 eggs + 1 can baked beans."); assert.equal(m.tips, 6); assert.deepEqual(m.badge, [["Easiest way to hit 40 g", "6. Eggs and baked beans"]]);
    assert.ok(m.scrolls, "list scrolls"); assert.equal(m.hash, "#/today");
    await page.click(".fx-x"); await closed(); assert.equal(await page.evaluate(() => location.hash), "#/today");
    await mealsOpen(); await page.keyboard.press("Escape"); await closed();
    await mealsOpen(); await page.mouse.click(195, 10); await closed(); // backdrop above the sheet
    await mealsOpen(); await page.goBack(); await closed(); assert.equal(await page.evaluate(() => location.hash), "#/today", "back gesture closes the sheet, stays on Today");
    assert.ok(await page.$(".fx-home #start"), "Today still there");
    await page.click("#start"); await page.waitForSelector(".exscreen");
    const ex = await page.evaluate(() => ({ pill: getComputedStyle(document.querySelector(".top .pill"), "::after").content, img: document.querySelector(".exhero img")?.getAttribute("src") || "" }));
    assert.equal(ex.pill, JSON.stringify(A.pill), `${f.slug}: workout-page tag`); assert.ok(ex.img.includes("img/ex-orange/"), `${f.slug}: orange exercise image`);
    await page.click('#nav a[href="#/today"]'); await page.waitForSelector("#start");
    assert.equal((await page.textContent("#start")).trim(), "Resume workout"); assert.ok(await page.$(".fx-start.resume"));
    await ctx.close();
  }
  // rest day on the themed home (a Wednesday on the 4-day plan): every copy shows 'Rest day', the recovery line, Next + weekday,
  // 'Train anyway', the themed M–S strip inside the hero, and the Built Different banner still fits above the nav
  for (const f of COPIES.filter(falconLook)) {
    const ctx = await rawContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), page = await ctx.newPage();
    await page.clock.install({ time: new Date(2026, 9, 28, 9, 0).getTime() });
    await page.goto(BASE + f.path); await unlock(page, f.pw); await page.waitForSelector("#bw");
    await page.fill("#bw", "90"); await page.selectOption("#days", "4"); await page.selectOption("#equip", "full"); await page.click("#ob-go"); await page.waitForSelector("#start");
    for (const [w, ht] of [[390, 844], [360, 780]]) {
      await page.setViewportSize({ width: w, height: ht }); await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; }); await page.waitForTimeout(150);
      const r = await page.evaluate(() => { const hero = document.querySelector(".fx-hero").getBoundingClientRect(), wk = document.querySelector(".fx-hero #week-strip");
        return { h1: document.querySelector(".fx-hero h1").textContent, line: document.querySelector("#rest-line")?.textContent, next: document.querySelector("#rest-next")?.textContent,
          start: document.querySelector("#start").textContent.trim(), chips: !!document.querySelector(".fx-chips"), rest: !!document.querySelector(".fx-home.fx-restday"),
          strip: wk && [...wk.querySelectorAll("li")].map((li) => (li.classList.contains("wk-on") ? "T" : "r") + (li.classList.contains("wk-now") ? "*" : "")).join(" "),
          inHero: !!wk && (() => { const b = wk.getBoundingClientRect(); return b.top >= hero.top && b.bottom <= hero.bottom && b.left >= hero.left && b.right <= hero.right; })(),
          clearTxt: (() => { const b = wk.getBoundingClientRect(); return [...document.querySelectorAll(".fx-hero h1, #rest-line, #rest-next")].every((x) => { const t = x.getBoundingClientRect(); return t.bottom <= b.top || t.top >= b.bottom || t.right <= b.left || t.left >= b.right; }); })(),
          order: (() => { const R = (q) => document.querySelector(q).getBoundingClientRect(), t = R(".fx-hero h1"), l = R("#rest-line"), w = R("#week-strip"), n = R("#rest-next");
            const st = R("#start"), wl = R("#rest-line");
            return [t.bottom <= l.top, // title, then the recovery line (top-left, unchanged)
              hero.right - w.right < hero.width * 0.05 && w.left > hero.left + hero.width * 0.4 && hero.bottom - w.bottom < hero.width * 0.03 && w.top > wl.bottom, // strip: bottom-right corner of the hero
              n.top >= hero.bottom && n.bottom <= st.top && Math.abs(n.left - st.left) < 1, // Next pill: below the hero, above Train anyway, left-aligned with it
              !document.querySelector(".fx-hero #rest-next")]; })(),
          built: document.querySelector(".fx-built").getBoundingClientRect().bottom, nav: document.querySelector("#nav").getBoundingClientRect().top }; });
      assert.equal(r.h1, "Today: Rest day", `${f.slug}`); assert.equal(r.line, "Recover and eat big: hit your protein and calories.");
      assert.equal(r.next, "Next: Upper A on Thursday"); assert.equal(r.start, "Train anyway: Upper A"); assert.ok(!r.chips && r.rest, "rest layout replaces the chips");
      assert.equal(r.strip, "T T r* T T r r"); assert.ok(r.inHero, `${f.slug}: strip inside the hero at ${w}`); assert.ok(r.clearTxt, `${f.slug}: strip clear of the hero text at ${w}`);
      assert.deepEqual(r.order, [true, true, true, true], `${f.slug}: title + recovery line top-left, week strip bottom-right in the hero, Next pill below the hero above Train anyway (left-aligned) at ${w}`);
      assert.ok(r.built <= r.nav, `${f.slug}: banner above the nav on a rest day at ${w}x${ht} (${r.built} > ${r.nav})`);
    }
    await page.click("#start"); await page.waitForSelector(".exscreen"); await page.click('#nav a[href="#/today"]'); await page.waitForSelector("#start");
    assert.equal((await page.textContent("#start")).trim(), "Resume workout"); assert.equal(await page.textContent(".fx-hero h1"), "Today: Upper A");
    await ctx.close();
  }
  ok(`${COPIES.filter(falconLook).map((f) => f.slug).join("/")} rest day (Wed): 'Today: Rest day', recovery line, 'Next: Upper A on Thursday', 'Train anyway: Upper A' starts it, themed M–S strip in the hero's bottom-right corner, Next pill below the hero above Train anyway (left-aligned), banner above the nav at 390x844 + 360x780`);
  // copies with "theme": "none" (and Zane's root, if defaultTheme were "") keep the stock Today page
  for (const { slug: who, path, pw } of COPIES.filter((c) => !c.theme)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
    await page.goto(BASE + path); await unlock(page, pw); await page.waitForSelector("#bw");
    await page.fill("#bw", "90"); await page.selectOption("#days", "4"); await page.click("#ob-go"); await page.waitForSelector("#start");
    assert.ok(!(await page.$(".fx-home")) && (await page.$(".card.hero #start")), `${who}: stock Today page`);
    await ctx.close();
  }
  ok(`${COPIES.filter(falconLook).map((f) => f.slug).join("/")} home v4 (own art + alt: Get Jacked / G6E Falcon / Hilux, workout tag BULK / G6E / Hilux, orange exercise images): 'Today: Upper A' + live chips (4 sets / 6–10 reps / RIR 1–2 / rest 3 min), Start -> Resume via the real #start, banner above the nav at 390x844 + 360x780, 2x2 boxes (Workouts #/workout, Progress #/progress, Cheat meals sheet with 9 meals that closes via X / Escape / backdrop / back, Supplements -> Xplosiv), gear -> #/settings, 5 icon tabs; zane keeps storage keys massplan.v1 + getjacked.unlocked; stock Today in: ${COPIES.filter((c) => !c.theme).map((c) => c.slug).join("/") || "none (no theme: none copies)"}`);
  console.log("ALL FRIEND TESTS PASSED");
} finally { await browser.close(); server?.kill(); }
