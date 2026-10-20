// Screenshots (Pixel 7) + a real, unmocked notification through the service worker.
// Past Upper A sessions are seeded as demo data so the progress chart has a line.
import { chromium, devices } from "playwright";
import { spawn } from "node:child_process";
const PORT = 9000 + Math.floor(Math.random() * 800), BASE = `http://localhost:${PORT}/`;
const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const b = await chromium.launch({ channel: "chromium" });
const ctx = await b.newContext({ ...devices["Pixel 7"] });
await ctx.grantPermissions(["notifications"], { origin: BASE.slice(0, -1) });
const p = await ctx.newPage();
await p.goto(BASE); await p.waitForSelector("#lock-pw"); await p.screenshot({ path: "screenshots/0-lock.png" });
await p.fill("#lock-pw", "zane"); await p.click("#lock-go");
const shot = (n, full = false) => p.screenshot({ path: `screenshots/${n}.png`, fullPage: full });
await p.goto(BASE); await p.waitForSelector("#bw"); await shot("1-onboarding");
await p.fill("#bw", "80"); await p.click("#ob-go"); await p.waitForSelector("#start");
await p.evaluate(() => {
  const S = window.__massplan.state, d = (n) => new Date(Date.now() - n * 864e5).toISOString();
  S.history = [36, 29, 22, 15, 8].map((n, k) => ({ date: d(n), session: "upperA", name: "Upper A", durationMin: 72, hardSets: 7, recovery: "good",
    exercises: { bench: { sets: [0, 1, 2, 3].map(() => ({ weight: 70 + k * 2.5, reps: 10, rir: 2, done: true })) }, csrow: { sets: [0, 1, 2].map(() => ({ weight: 55 + k * 2.5, reps: 9, rir: 2, done: true })) } } }));
  localStorage.setItem("massplan.v1", JSON.stringify(S));
});
await p.reload(); await p.waitForSelector("#start"); await shot("2-today");
await p.click("#start"); await p.waitForSelector("#finish");
const cards = p.locator("[data-ex]");
for (let c = 0; c < await cards.count(); c++) {
  const card = cards.nth(c), id = await card.getAttribute("data-ex"), wi = card.locator('[data-f="weight"]').first();
  if (id === "inclinedb") {
    await card.locator("details.sw summary").click(); await card.locator(".sw-w").fill("26"); await card.locator(".sw-r").fill("10"); await card.locator(".sw-go").click();
    await card.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -70)); await shot("5-starting-weight");
  }
  if (!(await wi.inputValue())) await wi.fill("20");
  const n = await card.locator('[data-f="done"]').count();
  for (let i = 0; i < n; i++) { await card.locator('[data-f="reps"]').nth(i).fill(c === 0 ? String(8 - i) : "12"); await card.locator('[data-f="rir"]').nth(i).fill("2"); await card.locator('[data-f="done"]').nth(i).check(); }
  if (c === 0) { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(1100); await shot("3-workout-rest-timer"); }
  if (id === "latraise") {
    await card.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -80)); await shot("5b-exercise-card-photo");
    await card.locator(".exthumb").click(); await p.waitForSelector("#photo:not([hidden]) img"); await p.waitForTimeout(300); await shot("5c-photo-enlarged"); await p.click("#photo .lb-x");
    await card.locator(".swap-btn").click(); await p.waitForSelector("#lightbox .altrow"); await p.waitForTimeout(300); await shot("5d-swap-alternatives"); await p.click("#lightbox .lb-x");
  }
  if (id === "csrow") { await card.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -150)); await shot("4-progression-earned"); }
}
await p.evaluate(() => { window.__massplan.state.active.startedAt = Date.now() - 74 * 60000; });
await p.evaluate(() => navigator.serviceWorker.ready);
await p.click("#finish"); await p.waitForSelector("#notify-status,#fallback-card");
const real = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; const ns = await r.getNotifications({ tag: "post-workout" }); return { perm: Notification.permission, count: ns.length, title: ns[0]?.title }; });
console.log("REAL (unmocked) notification:", JSON.stringify(real));
await shot("6-summary");
await p.goto(BASE + "#/progress"); await p.waitForSelector("#tracker"); await shot("7-weekly-tracker");
await p.locator("#chart").scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -120));
await p.locator("details.hist").first().click(); await shot("8-progress-history");
await p.goto(BASE + "#/why"); await shot("9-why", true);
await b.close(); srv.kill();
