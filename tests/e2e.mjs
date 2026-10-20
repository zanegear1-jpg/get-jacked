// Headless end-to-end test (Chromium, Pixel 7 emulation, served on localhost = secure context).
// Notification is mocked; ServiceWorkerRegistration.showNotification is spied on.
import { chromium, devices } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { postWorkout } from "../calc.js";

const PORT = 8000 + Math.floor(Math.random() * 900) + 100;
const BASE = `http://localhost:${PORT}/`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const results = [];
const ok = (name) => { results.push(name); console.log("PASS", name); };

const UNLOCK = `try { if (location.origin.startsWith("http")) localStorage.setItem("getjacked.unlocked", "1"); } catch {}`;
const mock = (grant, unlock = true) => `
  ${unlock ? UNLOCK : ""}
  window.__notes = []; window.__permRequests = 0;
  let __perm = "default";
  window.Notification = class { static get permission() { return __perm; }
    static async requestPermission() { window.__permRequests++; __perm = ${JSON.stringify(grant)}; return __perm; } };
  ServiceWorkerRegistration.prototype.showNotification = async function (title, options) { window.__notes.push({ title, options }); };
`;

async function runFinish(browser, grant) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.addInitScript(mock(grant));
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector("#bw");
  // bodyweight required
  await page.click("#ob-go"); assert.equal(await page.isVisible("#ob-err"), true);
  await page.fill("#bw", "80");
  await page.click("#ob-go");
  await page.waitForSelector("#start");
  await page.click("#start");
  await page.waitForSelector("#finish");
  const boxes = page.locator('input[data-f="done"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) { await page.locator('input[data-f="weight"]').nth(i).fill("50"); await boxes.nth(i).check(); }
  await page.evaluate(() => { window.__massplan.state.active.startedAt = Date.now() - 75 * 60000; });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.click("#finish");
  await page.waitForSelector(grant === "granted" ? "#notify-status" : "#fallback-card");
  const st = await page.evaluate(() => ({ notes: window.__notes, req: window.__permRequests, s: window.__massplan.state }));
  const expected = postWorkout(80, { hardSets: n, durationMin: st.s.lastSummary.pw.durationMin });
  assert.equal(st.req, 1, "permission requested on first finish");
  assert.equal(st.s.lastSummary.pw.proteinG, 44);
  assert.equal(st.s.lastSummary.pw.carbG, expected.carbG);
  assert.equal(st.s.history.length, 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  return { page, ctx, st, n, expected };
}

const browser = await chromium.launch({ channel: "chromium" });
try {
  // 1) permission granted -> real SW notification with the computed numbers
  {
    const { page, ctx, st, n, expected } = await runFinish(browser, "granted");
    assert.equal(st.notes.length, 1, "showNotification called once");
    const note = st.notes[0];
    assert.equal(note.title, `Workout done: eat ${expected.proteinG} g protein + ${expected.carbG} g carbs`);
    assert.equal(note.options.tag, "post-workout");
    assert.match(note.options.body, new RegExp(`${n} hard sets`));
    assert.equal(st.s.lastSummary.mode, "notified");
    ok(`finish -> notification: "${note.title}" (${n} sets, ${st.s.lastSummary.pw.durationMin} min, 80 kg)`);
    // autoregulation ran: first session, recovery good -> +1 set per muscle trained
    assert.equal(st.s.weeklySets.chest, 15); assert.equal(st.s.weeklySets.quads, 14);
    ok("autoregulation: trained muscles +1 set (chest 14->15), untrained unchanged");
    // Why this works shows calc + citations
    await page.goto(BASE + "#/why");
    const why = await page.textContent("#view");
    for (const s of ["Schoenfeld", "Aragon", "Morton", "Kerksick", "Iraki", "Baz-Valle", "10.1136/bjsports-2017-097608", `80 kg × 0.55 g/kg = 44 g`]) assert.ok(why.includes(s), "why has " + s);
    ok("'Why this works' shows the calculation and 6 citations");

    // PWA: manifest, installability, offline
    const man = await (await page.request.get(BASE + "manifest.webmanifest")).json();
    assert.equal(man.display, "standalone"); assert.equal(man.theme_color, "#111827");
    assert.ok(man.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
    assert.ok(man.icons.some((i) => i.sizes === "192x192" && i.purpose === "any"));
    const cdp = await ctx.newCDPSession(page);
    const inst = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ err: String(e) }));
    if (inst.err) console.log("NOTE installability check unavailable:", inst.err);
    else {
      // "in-incognito" only exists because Playwright contexts are incognito; a real Chrome profile doesn't have it.
      const real = inst.installabilityErrors.filter((e) => e.errorId !== "in-incognito");
      assert.deepEqual(real, [], JSON.stringify(real));
      ok("Chrome installability check: no errors (besides the test-only incognito flag)");
    }
    await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    await page.goto(BASE + "#/today"); await page.waitForSelector("#start");
    await page.goto(BASE + "#/why"); await page.waitForSelector("text=Sources");
    await page.goto(BASE + "#/workout"); await page.waitForSelector("[data-pv] .exthumb img");
    const offImgs = await page.$$eval("[data-pv] .exthumb img", (imgs) => Promise.all(imgs.map((i) => i.decode().then(() => i.naturalWidth, () => 0))));
    assert.ok(offImgs.length >= 5 && offImgs.every((w) => w > 0), "exercise photos load offline " + offImgs);
    await ctx.setOffline(false);
    ok("works offline after first load (service worker cache)");
    await ctx.close();
  }
  // 2) permission denied -> no notification, in-app summary card
  {
    const { ctx, st, expected } = await runFinish(browser, "denied");
    assert.equal(st.notes.length, 0);
    assert.equal(st.s.lastSummary.mode, "card");
    ok(`denied -> fallback card "${expected.proteinG} g protein + ${expected.carbG} g carbs", no notification`);
    await ctx.close();
  }
  // 3) regressions: empty finish is refused; a skipped muscle keeps its volume; weigh-in refreshes Settings
  {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    await ctx.addInitScript(mock("denied"));
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(BASE); await page.fill("#bw", "80"); await page.click("#ob-go");
    await page.click("#start"); await page.waitForSelector("#finish");
    await page.click("#finish");
    assert.equal(await page.isVisible("#finish-err"), true, "empty finish shows an error");
    let s = await page.evaluate(() => window.__massplan.state);
    assert.equal(s.history.length, 0); assert.ok(s.active, "workout still active"); assert.equal(s.weeklySets.chest, 14);
    // tick only the bench sets: chest trained, back/arms/delts skipped
    const bench = page.locator('[data-ex="bench"]');
    const nb = await bench.locator('input[data-f="done"]').count();
    for (let i = 0; i < nb; i++) { await bench.locator('input[data-f="weight"]').nth(i).fill("60"); await bench.locator('input[data-f="done"]').nth(i).check(); }
    await page.click("#finish"); await page.waitForSelector("#fallback-card");
    s = await page.evaluate(() => window.__massplan.state);
    assert.equal(s.history.length, 1); assert.equal(s.weeklySets.chest, 15); assert.equal(s.weeklySets.back, 14); assert.equal(s.weeklySets.biceps, 10);
    ok("empty finish refused; only trained muscles get volume changes");
    await page.goto(BASE + "#/settings"); await page.fill("#wi", "81.5"); await page.click("#wi-add");
    assert.equal(await page.inputValue("#bw"), "81.5", "bodyweight field follows the weigh-in");
    await page.click("#st-save");
    s = await page.evaluate(() => window.__massplan.state);
    assert.equal(s.profile.bodyweightKg, 81.5, "Save after a weigh-in keeps the new bodyweight");
    assert.ok((await page.textContent("#view")).includes("81.5 kg"), "weigh-in list refreshed");
    assert.equal(errors.length, 0, errors.join("\n"));
    ok("weigh-in updates the bodyweight field and list; Save doesn't revert it");
    await ctx.close();
  }
  // 0) lock screen: shows first, wrong password errors, right one (any case) unlocks and routes; re-lock; offline
  {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    await ctx.addInitScript(mock("denied", false));
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept());
    await page.goto(BASE); await page.waitForSelector("#lock-pw");
    assert.equal(await page.isVisible("#nav"), false); assert.equal(await page.locator("#bw").count(), 0, "nothing renders before unlock");
    await page.fill("#lock-pw", "wrong"); await page.click("#lock-go");
    await page.waitForSelector("#lock-err:not([hidden])");
    await page.fill("#lock-pw", " ZaNe "); await page.click("#lock-go");
    await page.waitForSelector("#bw");
    await page.reload(); await page.waitForSelector("#bw"); // stays unlocked
    await page.fill("#bw", "80"); await page.click("#ob-go"); await page.waitForSelector("#start");
    const src = await (await page.request.get(BASE + "app.js")).text();
    assert.ok(!/["'`]zane["'`]/i.test(src), "plain-text password not in the code");
    await page.goto(BASE + "#/settings"); await page.click("#lock-app"); await page.waitForSelector("#lock-pw");
    // regression: typing straight after "Lock app" must survive the hashchange re-render
    await page.fill("#lock-pw", "zane"); await page.waitForTimeout(300); assert.equal(await page.inputValue("#lock-pw"), "zane", "typed password kept");
    await page.press("#lock-pw", "Enter"); await page.waitForSelector("#start");
    await page.goto(BASE + "#/settings"); await page.click("#lock-app"); await page.waitForSelector("#lock-pw");
    await page.goto(BASE + "#/summary"); await page.reload(); await page.waitForSelector("#lock-pw"); // e.g. a notification tap while locked
    await page.fill("#lock-pw", "zane"); await page.press("#lock-pw", "Enter");
    await page.waitForSelector("text=No workout yet"); // routed to the requested screen after unlocking
    assert.equal((await page.evaluate(() => window.__massplan.state)).profile.bodyweightKg, 80, "saved data intact");
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.goto(BASE + "#/settings"); await page.click("#lock-app"); await page.waitForSelector("#lock-pw");
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector("#lock-pw");
    await page.fill("#lock-pw", "zane"); await page.click("#lock-go"); await page.waitForSelector("#start");
    await ctx.setOffline(false);
    assert.equal(errors.length, 0, errors.join("\n"));
    ok("lock screen: wrong password errors, ' ZaNe ' unlocks, stays unlocked, Lock app re-locks, routes to #/summary after unlock, works offline");
    await ctx.close();
  }

  // ---------- new features ----------
  const fresh = async (opts = {}) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
    await ctx.addInitScript(mock("denied"));
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("dialog", (d) => d.accept());
    if (opts.clock) await page.clock.install();
    return { ctx, page, errors };
  };
  const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__massplan.state)));
  const onboard = async (page, { bw = "80", days, equip, exp } = {}) => {
    await page.goto(BASE); await page.waitForSelector("#bw"); await page.fill("#bw", bw);
    if (days) await page.selectOption("#days", String(days));
    if (equip) await page.selectOption("#equip", equip);
    if (exp) await page.selectOption("#exp", exp);
    await page.click("#ob-go"); await page.waitForSelector("#start");
  };
  const doSession = async (page, { only, reps = "10", weight = "50" } = {}) => {
    await page.goto(BASE + "#/today"); await page.waitForSelector("#start"); await page.click("#start"); await page.waitForSelector("#finish");
    const cards = page.locator("[data-ex]");
    for (let c = 0; c < await cards.count(); c++) {
      const card = cards.nth(c); if (only && !only.includes(await card.getAttribute("data-ex"))) continue;
      await card.locator('[data-f="weight"]').first().fill(weight);
      const n = await card.locator('[data-f="done"]').count();
      for (let i = 0; i < n; i++) { await card.locator('[data-f="reps"]').nth(i).fill(reps); await card.locator('[data-f="done"]').nth(i).check(); }
    }
    await page.click("#rest-skip").catch(() => {});
    await page.click("#finish"); await page.waitForSelector("#fallback-card");
  };

  // 4) workout: Start button, weight carry, RIR, rest timer (+/-15s, beep/vibrate, sticky), auto reps, swap
  {
    const { ctx, page, errors } = await fresh({ clock: true });
    await onboard(page);
    await page.click('#nav a[href="#/workout"]'); await page.waitForSelector("#start-workout");
    assert.equal((await state(page)).active, null, "Workout tab doesn't auto-start");
    await page.click("#start-workout"); await page.waitForSelector("#finish");
    assert.ok(await page.isVisible("#calib"), "calibration week tip");
    for (const [id, w, r, want] of [["csrow", "60", "10", "60"], ["inclinedb", "30", "8", "28"]]) {
      const card = page.locator(`[data-ex="${id}"]`);
      await card.locator("details.sw summary").click();
      await card.locator(".sw-w").fill(w); await card.locator(".sw-r").fill(r); await card.locator(".sw-go").click();
      assert.deepEqual([...new Set(await card.locator('[data-f="weight"]').evaluateAll((els) => els.map((e) => e.value)))], [want], `${id} starting weight`);
      assert.match(await card.locator(".sw-out").textContent(), new RegExp(`work at ${want} kg`));
    }
    ok("calibration-week tip; starting-weight helper prefills 60 kg (row, 2.5 kg steps) / 28 kg (dumbbells, 2 kg steps)");
    const bench = page.locator('[data-ex="bench"]');
    await bench.locator('[data-f="weight"]').first().fill("60");
    assert.deepEqual(await bench.locator('[data-f="weight"]').evaluateAll((els) => els.map((e) => e.value)), Array((await bench.locator('[data-f="weight"]').count())).fill("60"), "weight carried");
    assert.equal(await bench.locator('[data-f="rir"]').first().getAttribute("placeholder"), "1–2");
    await bench.locator('[data-f="rir"]').first().fill("2");
    await bench.locator('[data-f="reps"]').first().fill("10");
    await bench.locator('[data-f="done"]').first().check();
    await page.waitForSelector("#rest:not([hidden])");
    assert.equal(await page.textContent("#rest-time"), "3:00");
    await page.click("#rest-plus"); assert.equal(await page.textContent("#rest-time"), "3:15");
    await page.click("#rest-minus"); await page.click("#rest-minus"); assert.equal(await page.textContent("#rest-time"), "2:45");
    await page.locator("#discard").scrollIntoViewIfNeeded();
    const box = await page.locator("#rest").boundingBox(), vp = page.viewportSize();
    assert.ok(box && box.y >= 0 && box.y + box.height <= vp.height, "rest timer visible while scrolled");
    await page.clock.runFor(166_000);
    assert.equal(await page.textContent("#rest-time"), "Go!");
    const dbg = await page.evaluate(() => window.__massplan.debug);
    assert.equal(dbg.beeps, 1, "beep at the end"); assert.ok(dbg.vibrations >= 1, "vibrate at the end");
    await page.clock.runFor(6000); assert.equal(await page.isVisible("#rest"), false);
    await bench.locator('[data-f="done"]').nth(1).check();
    assert.equal(await bench.locator('[data-f="reps"]').nth(1).inputValue(), "6", "empty reps prefilled with the low end");
    let s = await state(page);
    assert.equal(s.active.exercises.bench.sets[1].auto, true);
    await page.locator('[data-ex="latraise"] [data-f="done"]').first().check();
    assert.equal(await page.textContent("#rest-time"), "1:30", "isolation rest 1.5 min");
    await page.click("#rest-skip"); assert.equal(await page.isVisible("#rest"), false);
    ok("Workout tab shows Start; weight carries; RIR saved; rest timer 3:00/1:30, ±15s, beep+vibrate, sticky; empty reps -> low end");
    // exercise photo: thumbnail loads from the bundle, tap -> start/finish full size
    const thumbOk = await page.locator('[data-ex="bench"] .exthumb img').evaluate((i) => i.complete && i.naturalWidth > 0 && !i.src.startsWith("http") || new URL(i.src).origin === location.origin);
    assert.ok(thumbOk, "bench thumbnail from the app's own origin");
    await page.locator('[data-ex="bench"] .exthumb').click(); await page.waitForSelector("#photo:not([hidden]) img");
    assert.ok(await page.locator("#photo img").evaluate((i) => new Promise((r) => i.complete ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))) > 300);
    assert.match(await page.textContent("#photo"), /Start.*Finish/s);
    await page.click("#photo .lb-x"); assert.equal(await page.isVisible("#photo"), false);
    // swap sheet lists alternatives with photos (or the muscle-icon fallback)
    await page.locator('[data-ex="latraise"] .swap-btn').click(); await page.waitForSelector("#lightbox:not([hidden]) .altrow");
    assert.ok(await page.locator('#lightbox .altrow .exthumb img').count() >= 2, "alternatives have photos");
    assert.equal(await page.locator('#lightbox .altrow .exthumb.fallback').count(), 1, "machine lateral raise uses the fallback icon");
    await page.locator('#lightbox .altrow .exthumb[data-img="cablelat"]').click(); await page.waitForSelector("#photo:not([hidden])");
    await page.keyboard.press("Escape"); assert.equal(await page.isVisible("#photo"), false); assert.ok(await page.isVisible("#lightbox"), "photo closes back to the swap list");
    await page.click("#lightbox .lb-x"); assert.equal(await page.isVisible("#lightbox"), false);
    ok("exercise photos: thumbnail, tap to enlarge start/finish, swap sheet shows photos + fallback icon");
    await page.locator('[data-ex="inclinedb"] .swap-btn').click();
    await page.locator('#lightbox [data-swap="cablefly"]').click();
    await page.waitForSelector('[data-ex="cablefly"]');
    s = await state(page);
    assert.equal(s.swaps["upperA:chestA2"], "cablefly"); assert.ok(!s.active.exercises.inclinedb);
    for (let i = 2; i < await bench.locator('[data-f="done"]').count(); i++) { await bench.locator('[data-f="reps"]').nth(i).fill("10"); await bench.locator('[data-f="done"]').nth(i).check(); }
    await page.click("#finish"); await page.waitForSelector("#fallback-card");
    s = await state(page);
    assert.equal(s.history[0].exercises.bench.sets[0].rir, 2);
    await page.evaluate(() => { const S = window.__massplan.state; S.nextSession = 0; localStorage.setItem("massplan.v1", JSON.stringify(S)); });
    await page.goto(BASE + "#/workout"); await page.reload(); await page.waitForSelector("#start-workout");
    const pv = await page.textContent("#view");
    assert.ok(pv.includes("Cable fly") && !pv.includes("Incline dumbbell press"), "swap remembered");
    assert.ok(pv.includes("Log your reps"), "auto-filled reps don't count as top of range");
    assert.match(await page.locator('[data-pv="bench"] .prog').textContent(), /4 more reps to go heavier/);
    await page.click("#start-workout"); await page.waitForSelector("#finish");
    assert.equal(await page.locator('[data-ex="bench"] [data-f="weight"]').first().inputValue(), "60", "no increase from auto reps");
    assert.match(await page.textContent('[data-ex="bench"] .ptext'), /4 more reps to go heavier/);
    assert.equal(await page.isVisible('[data-ex="bench"] details.sw'), false, "no starting-weight helper once there's history");
    const b2 = page.locator('[data-ex="bench"]'), nb2 = await b2.locator('[data-f="done"]').count();
    for (let i = 0; i < nb2; i++) { await b2.locator('[data-f="reps"]').nth(i).fill("10"); await b2.locator('[data-f="rir"]').nth(i).fill("2"); if (i < nb2 - 1) await b2.locator('[data-f="done"]').nth(i).check(); }
    assert.ok(!(await b2.locator(".live").textContent()).includes("Earned"), "not earned until every set is ticked");
    await b2.locator('[data-f="done"]').nth(nb2 - 1).check();
    assert.match(await b2.locator(".live").textContent(), /Earned! Next time: 62.5 kg/);
    await page.click("#rest-skip");
    await page.click("#finish"); await page.waitForSelector("#fallback-card");
    await page.evaluate(() => { const S = window.__massplan.state; S.nextSession = 0; localStorage.setItem("massplan.v1", JSON.stringify(S)); });
    await page.reload(); await page.goto(BASE + "#/workout"); await page.waitForSelector("#start-workout"); await page.click("#start-workout"); await page.waitForSelector("#finish");
    assert.equal(await page.textContent('[data-ex="bench"] .badge'), "GO HEAVIER: 62.5 kg");
    assert.equal(await page.locator('[data-ex="bench"] [data-f="weight"]').first().inputValue(), "62.5", "earned weight prefilled");
    ok("progression indicator: '4 more reps to go heavier' bar, live 'Earned! Next time: 62.5 kg', then GO HEAVIER badge + prefill");
    assert.equal(errors.length, 0, errors.join("\n"));
    ok("swap persists for future sessions; progression ignores auto-filled reps");
    await ctx.close();
  }

  // 5) days/equipment settings, volume cap, tracker, chart, history, export/import
  {
    const { ctx, page, errors } = await fresh();
    await onboard(page, { bw: "70", days: 6, equip: "home", exp: "novice" });
    assert.equal(await page.textContent("h1"), "Today: Push A");
    assert.ok((await page.textContent("#view")).includes("Push-up"));
    await page.reload(); await page.goto(BASE + "#/settings"); await page.waitForSelector("#st-save");
    assert.equal(await page.inputValue("#days"), "6"); assert.equal(await page.inputValue("#equip"), "home");
    await page.selectOption("#days", "4"); await page.selectOption("#equip", "full"); await page.selectOption("#exp", "intermediate"); await page.click("#st-save");
    await page.reload(); await page.goto(BASE + "#/today"); await page.waitForSelector("#start");
    assert.equal(await page.textContent("h1"), "Today: Upper A");
    ok("days/equipment/experience saved and persist; program regenerates (6-day home -> 4-day gym)");
    await doSession(page); // Upper A
    let s = await state(page); const chestAfterA = s.weeklySets.chest;
    assert.equal(chestAfterA, 11, "novice start 10 -> +1");
    await doSession(page, { only: ["squat"] }); // Lower A
    await doSession(page); // Upper B: chest trained again this week
    s = await state(page);
    assert.equal(s.weeklySets.chest, chestAfterA, "at most +1 set per muscle per week");
    assert.ok((await page.textContent("#view")).includes("already +1 this week"));
    ok("volume adjustment capped at +1 set per muscle per week");
    await page.goto(BASE + "#/progress"); await page.waitForSelector("#tracker");
    const chestDone = s.history.filter((h) => h.session !== "lowerA").reduce((n, h) => n + Object.entries(h.exercises).filter(([id]) => ["bench", "inclinedb", "machpress", "dip"].includes(id)).reduce((k, [, x]) => k + x.sets.filter((q) => q.done).length, 0), 0);
    assert.equal(await page.textContent('[data-m="chest"] .tnum'), `${chestDone}/${s.weeklySets.chest}`);
    assert.equal(await page.textContent('[data-m="quads"] .tnum'), `${s.history[1].exercises.squat.sets.length}/${s.weeklySets.quads}`);
    assert.equal(await page.locator("details.hist").count(), 3);
    await page.selectOption("#chart-ex", "bench");
    assert.equal(await page.locator("#chart circle").count(), 1);
    ok("weekly tracker shows actual done vs target; history lists 3 workouts; e1RM chart renders");
    await page.goto(BASE + "#/settings"); await page.waitForSelector("#export");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#export")]);
    const file = await dl.path(); const exported = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
    assert.equal(exported.app, "get-jacked"); assert.equal(exported.data.history.length, 3);
    await page.click("#reset"); await page.waitForSelector("#ob-go");
    await page.setInputFiles("#import", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await page.waitForFunction(() => document.querySelector("#bk-msg").textContent.includes("isn't"));
    await page.setInputFiles("#import", file); await page.waitForSelector("#start");
    const back = await state(page);
    assert.deepEqual(back.history, exported.data.history); assert.deepEqual(back.weeklySets, exported.data.weeklySets); assert.deepEqual(back.profile, exported.data.profile);
    await page.reload(); await page.waitForSelector("#start"); assert.equal((await state(page)).history.length, 3);
    assert.equal(errors.length, 0, errors.join("\n"));
    ok("export -> reset -> import JSON round-trips; bad file rejected");
    await ctx.close();
  }

  // 6) v1 data migrates; deload suggestion; calorie goal below maintenance warns and macros add up
  {
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE); await page.waitForSelector("#bw");
    await page.evaluate(() => {
      const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
      const ses = (n, w) => ({ date: d(n), session: "upperA", durationMin: 70, hardSets: 4, recovery: "good", exercises: { bench: { sets: [{ weight: w, reps: 8, done: true }] } } });
      localStorage.setItem("massplan.v1", JSON.stringify({ profile: { bodyweightKg: 80, experience: "intermediate", maintenanceKcal: null, calorieGoal: null },
        weeklySets: { chest: 15, back: 14, quads: 14, hamstrings: 12, delts: 12, biceps: 10, triceps: 10, calves: 10 }, nextSession: 1,
        history: [ses(50, 60), ses(40, 62.5), ses(30, 65), ses(20, 67.5)], weighIns: [], kcalAdjust: 0, lastKcalAdjustAt: 0, active: null, lastSummary: null }));
    });
    await page.reload(); await page.waitForSelector("#start");
    const s = await state(page);
    assert.equal(s.schema, 2); assert.equal(s.history.length, 4); assert.equal(s.weeklySets.chest, 15); assert.equal(s.profile.days, 4);
    assert.equal(await page.textContent("h1"), "Today: Lower A");
    ok("v1 saved data migrates in place (same massplan.v1 key)");
    assert.ok(await page.isVisible("#deload-card"));
    const setsBefore = parseInt((await page.textContent(".hero .big")).split("·")[1]);
    await page.click("#deload-start"); await page.waitForSelector("#deload-on");
    const setsAfter = parseInt((await page.textContent(".hero .big")).split("·")[1]);
    assert.ok(setsAfter <= Math.ceil(setsBefore / 2) + 3 && setsAfter < setsBefore, `${setsBefore} -> ${setsAfter}`);
    ok(`deload suggested after 6+ weeks; deload week halves sets (${setsBefore} -> ${setsAfter})`);
    await page.goto(BASE + "#/settings"); await page.fill("#goal", "2000"); await page.click("#st-save");
    await page.goto(BASE + "#/today"); await page.waitForSelector("#warn-maint");
    const t = await page.$$eval("table tr td:nth-child(2) b", (b) => b.map((x) => parseFloat(x.textContent)));
    assert.ok(Math.abs(t[1] * 4 + t[2] * 4 + t[3] * 9 - t[0]) <= 3, `macros add up ${t}`);
    assert.equal(errors.length, 0, errors.join("\n"));
    ok(`calorie goal below maintenance warns; macros add up (${t[0]} kcal = ${t[1]}P/${t[2]}C/${t[3]}F)`);
    await ctx.close();
  }
} finally {
  await browser.close(); server.kill();
}
console.log(`\n${results.length} e2e checks passed`);
