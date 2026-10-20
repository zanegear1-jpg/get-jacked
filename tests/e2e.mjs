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

const mock = (grant) => `
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
} finally {
  await browser.close(); server.kill();
}
console.log(`\n${results.length} e2e checks passed`);
