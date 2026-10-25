import { EVIDENCE as E, dailyTargets, postWorkout, notificationText, e1rm, autoregulate, calorieAdjust, plannedSets, validBodyweight,
  minKcalAdjust, localDate, restSeconds, progression, progressStatus, startingWeight, weekKey, weekStart, weeklyDone, e1rmSeries, deloadCheck } from "./calc.js";
import { MUSCLES, LIBRARY, EQUIPMENT, DAYS, SET_RANGE, buildProgram, muscleFrequency, muscleOrdinal, alternatives, startWeeklySets } from "./program.js";
import { sendPostWorkout, ensurePermission, permissionState } from "./notify.js";
import { fresh, migrate } from "./state.js";
import { WEEKDAYS, WEEK_SHORT, defaultSchedule, cleanSchedule, checkSchedule, scheduleFor, sameSchedule, isTrainingDay, nextTrainingDay, whenText, backToBack, backToBackText, weekStrip } from "./schedule.js";
import { thumbHTML, heroHTML, photoHTML } from "./media.js";
import { clampIndex, exerciseStatus, swipeDir, positionLabel } from "./stepper.js";
import { CONFIG } from "./config.js";

const KEY = CONFIG.storagePrefix + "massplan.v1"; // unchanged since v1 so saved data carries over; state.js migrates the shape. Friends get a prefix.
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");
const DAY = 864e5;

function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch { return null; }
}
let S = load() || fresh();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
save();
const debug = { beeps: 0, vibrations: 0 };
window.__massplan = { get state() { return S; }, debug }; // for tests / debugging

// ---------- install (Android Chrome) ----------
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; $("#install-btn").hidden = false; });
$("#install-btn").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $("#install-btn").hidden = true;
});
window.addEventListener("appinstalled", () => { $("#install-btn").hidden = true; });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

// ---------- helpers ----------
const program = () => buildProgram({ days: S.profile?.days, equipment: S.profile?.equipment, experience: S.profile?.experience, swaps: S.swaps });
const session = () => { const p = program(); return p[S.nextSession % p.length]; };
const exName = (id) => LIBRARY[id]?.name || id;
const lastFor = (exId) => { for (let i = S.history.length - 1; i >= 0; i--) { const x = S.history[i].exercises[exId]; if (x) return x; } return null; };
function inDeload() {
  if (S.deload && Date.now() >= S.deload.until) { S.deloadSince = S.deload.until; S.deload = null; save(); }
  return !!S.deload;
}
function deloadSuggestion() {
  if (inDeload() || Date.now() < (S.deloadSnoozeUntil || 0)) return { suggest: false };
  const main = [...new Set(program().map((s) => s.exercises[0].id))];
  return deloadCheck({ history: S.history, mainLiftIds: main, since: Math.max(S.deloadSince || 0, S.deloadSnoozeUntil || 0) });
}
function weeklyTargets() {
  const half = inDeload();
  return Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, half ? Math.ceil(S.weeklySets[m] / 2) : S.weeklySets[m]]));
}
function targets() { return dailyTargets({ ...S.profile, kcalAdjust: S.kcalAdjust }); }

// ---------- views ----------
const routes = { onboarding, today, workout, summary, progress, why, settings };
// ---------- lock screen (client-side deterrent only: this is a public static site) ----------
const LOCK_KEY = CONFIG.storagePrefix + "getjacked.unlocked";
const PASS_SHA256 = CONFIG.passSha256; // SHA-256 of the lower-cased password (config.js / a friend's user.js)
const isUnlocked = () => { try { return localStorage.getItem(LOCK_KEY) === "1"; } catch { return false; } };
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function lockScreen() {
  if ($("#lock")) return; // already showing: a second render (e.g. hashchange) must not wipe what's being typed
  $("#nav").hidden = true; $("#rest").hidden = true; document.body.classList.add("locked");
  view.innerHTML = `
  <form class="lock" id="lock" autocomplete="off">
    <img src="icons/icon-192.png" alt="" width="88" height="88">
    <h1>Get Jacked</h1>
    <p class="muted">Enter the password to open the app.</p>
    <label for="lock-pw" class="sr">Password</label>
    <input id="lock-pw" type="password" autocomplete="current-password" placeholder="Password" required>
    <p id="lock-err" class="err" hidden>Wrong password. Try again.</p>
    <button class="primary" id="lock-go" type="submit">Unlock</button>
  </form>`;
  const inp = $("#lock-pw"); inp.focus();
  $("#lock").onsubmit = async (e) => {
    e.preventDefault();
    const ok = (await sha256Hex(inp.value.trim().toLowerCase())) === PASS_SHA256;
    if (!ok) { $("#lock-err").hidden = false; inp.select(); return; }
    localStorage.setItem(LOCK_KEY, "1"); document.body.classList.remove("locked"); render(); // routes to whatever the URL asked for (e.g. #/summary from a notification)
  };
}

function render() {
  if (!isUnlocked()) return lockScreen();
  let r = (location.hash.replace(/^#\//, "") || "today").split("?")[0];
  if (!S.profile && r !== "why") r = "onboarding";
  if (!routes[r]) r = "today";
  $("#nav").hidden = r === "onboarding";
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + r));
  routes[r]();
  window.scrollTo(0, 0);
  restTick();
}
window.addEventListener("hashchange", render);
const go = (r) => { if (location.hash === "#/" + r) render(); else location.hash = "#/" + r; };

const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(cur) === String(val) ? "selected" : ""}>${esc(label)}</option>`;
const dayList = (sched) => cleanSchedule(sched).map((d) => WEEK_SHORT[d]).join(", ");
function trainDaysRow(sched) {
  return `<div class="td" id="td-wrap"><span class="td-l" id="td-l">Training days</span>
  <div class="td-row" role="group" aria-labelledby="td-l">${WEEK_SHORT.map((n, i) => {
    const on = sched.includes(i);
    return `<button type="button" class="td-day${on ? " on" : ""}" data-d="${i}" aria-pressed="${on}" aria-label="${WEEKDAYS[i]}">${n}</button>`;
  }).join("")}</div>
  <p class="small" id="td-msg" aria-live="polite"></p>
  <p class="small warn" id="td-warn" hidden></p>
  <button type="button" class="small" id="td-reset">Reset to recommended</button></div>`;
}
function profileForm(p = {}, { days: daysRow = "hint" } = {}) {
  const sched = scheduleFor({ days: p.days ?? 4, schedule: p.schedule });
  return `
  <label for="bw">Bodyweight (kg) *</label>
  <input id="bw" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${esc(p.bodyweightKg ?? "")}" required>
  <label for="days">Training days per week</label>
  <select id="days">${DAYS.map((d) => opt(d, { 3: "3 days: full body", 4: "4 days: upper / lower", 5: "5 days: upper / lower + push / pull / legs", 6: "6 days: push / pull / legs ×2" }[d], p.days ?? 4)).join("")}</select>
  ${daysRow === "row" ? trainDaysRow(sched) : `<p class="small muted" id="td-hint">Training days: ${dayList(sched)}. You can change them in Settings.</p>`}
  <label for="equip">Equipment</label>
  <select id="equip">${Object.entries(EQUIPMENT).map(([k, v]) => opt(k, v.label, p.equipment ?? "full")).join("")}</select>
  <label for="exp">Training experience</label>
  <select id="exp">${["novice", "intermediate", "advanced"].map((x) => opt(x, x, p.experience ?? "intermediate")).join("")}</select>
  <p class="small muted">Novice/intermediate bulk at +15% above maintenance; advanced at +7.5% (Iraki 2019). Novices get easier swaps for weighted pull-ups and dips.</p>
  <label for="maint">Maintenance calories (optional)</label>
  <input id="maint" type="number" inputmode="numeric" placeholder="Leave blank to estimate" value="${esc(p.maintenanceKcal ?? "")}">
  <label for="goal">Daily calorie goal (optional, overrides the bulk default)</label>
  <input id="goal" type="number" inputmode="numeric" placeholder="Blank = lean-bulk default" value="${esc(p.calorieGoal ?? "")}">`;
}
/** Returns {profile} or {error}. */
function readProfile() {
  const bw = parseFloat($("#bw").value);
  if (!validBodyweight(bw)) return { error: "Enter your bodyweight in kg (30–250). It drives every protein and carb number." };
  const num = (id) => { const v = parseFloat($(id).value); return v > 0 ? v : null; };
  const maint = num("#maint"), goal = num("#goal");
  if (maint !== null && (maint < 1200 || maint > 7000)) return { error: "Maintenance calories should be 1200–7000, or blank." };
  if (goal !== null && (goal < 1200 || goal > 8000)) return { error: "Calorie goal should be 1200–8000, or blank." };
  const days = +$("#days").value, row = $("#td-wrap");
  const schedule = row ? [...row.querySelectorAll(".td-day.on")].map((b) => +b.dataset.d) : defaultSchedule(days);
  if (row) { const c = checkSchedule(schedule, days); if (!c.ok) return { error: c.message }; }
  return { profile: { bodyweightKg: bw, days, equipment: $("#equip").value, experience: $("#exp").value, maintenanceKcal: maint, calorieGoal: goal, schedule: cleanSchedule(schedule) } };
}

function onboarding() {
  view.innerHTML = `
  <h1>Let's build muscle</h1>
  <p class="muted">Get Jacked has one job: help you put on as much muscle as possible. It sets a lean-bulk surplus,
  high protein, high-but-recoverable training volume, and tells you what to eat after every session.</p>
  <div class="card">${profileForm()}
  <p id="ob-err" class="err" hidden></p></div>
  <div class="card">
    <strong>Post-workout notifications</strong>
    <p class="small muted">When you tap Finish workout, Get Jacked sends a notification with exactly how much protein and carbs to eat.</p>
    <button id="ob-notif" type="button">Allow notifications</button> <span id="ob-notif-state" class="small muted"></span>
  </div>
  <button id="ob-go" class="primary">Start bulking</button>
  <p class="small muted" style="margin-top:14px">New phone? <label class="btn small-btn" for="import">Restore from a backup</label></p>
  <input id="import" type="file" accept="application/json,.json" hidden><p id="bk-msg" class="small"></p>`;
  $("#import").onchange = (e) => importBackup(e, () => go("today"));
  $("#days").onchange = () => { $("#td-hint").textContent = `Training days: ${dayList(defaultSchedule(+$("#days").value))}. You can change them in Settings.`; };
  const showState = () => { $("#ob-notif-state").textContent = { granted: "On", denied: "Blocked: you'll get an in-app card instead", default: "", unsupported: "Not supported here: in-app card instead" }[permissionState()]; };
  showState();
  $("#ob-notif").onclick = async () => { await ensurePermission(); showState(); };
  $("#ob-go").onclick = () => {
    const r = readProfile();
    if (r.error) { $("#ob-err").textContent = r.error; $("#ob-err").hidden = false; return; }
    S.profile = r.profile; S.weeklySets = startWeeklySets(r.profile); S.nextSession = 0;
    S.weighIns.push({ date: localDate(), kg: r.profile.bodyweightKg }); save(); go("today");
  };
}

function nutritionCard() {
  const t = targets();
  return `<div class="card">
    <strong>Daily bulk targets</strong>
    <table>
      <tr><td>Calories</td><td><b>${t.kcal}</b> kcal ${t.goalGiven ? "(your goal)" : `(maintenance ${t.maintenance}${t.maintenanceIsEstimate ? " est." : ""} +${+(t.surplus * 100).toFixed(1)}%${S.kcalAdjust ? `, ${S.kcalAdjust > 0 ? "+" : ""}${S.kcalAdjust} weigh-in adj.` : ""})`}</td></tr>
      <tr><td>Protein</td><td><b>${t.proteinG} g</b> (${+(t.proteinG / S.profile.bodyweightKg).toFixed(1)} g/kg, over 4+ meals)</td></tr>
      <tr><td>Carbs</td><td><b>${t.carbG} g</b>${t.carbBelowFloor ? "" : ` (at least ${t.carbMinG} g)`}</td></tr>
      <tr><td>Fat</td><td><b>${t.fatG} g</b></td></tr>
      <tr><td>Weight gain</td><td>${t.weeklyGainKg[0]}–${t.weeklyGainKg[1]} kg / week</td></tr>
    </table>
    ${t.belowMaintenance ? `<p class="small warn" id="warn-maint">Your calorie goal is below maintenance (${t.maintenance} kcal): you'll likely lose weight, which works against building muscle.</p>` : ""}
    ${t.goalTooLow ? `<p class="small warn">That goal can't cover minimum protein and fat, so it's raised to ${t.kcal} kcal.</p>` : ""}
    ${t.fatReduced || t.carbBelowFloor ? `<p class="small warn">To fit ${t.kcal} kcal, ${[t.fatReduced && "fat", t.carbBelowFloor && `carbs (below the ${t.carbMinG} g bulk floor)`].filter(Boolean).join(" and ")} are reduced. Protein stays high.</p>` : ""}
  </div>`;
}

function weekSummaryLine() {
  const done = weeklyDone(S.history, (id) => LIBRARY[id]?.muscle), tg = weeklyTargets();
  const d = Object.keys(MUSCLES).reduce((n, m) => n + Math.min(done[m] || 0, tg[m]), 0), t = Object.values(tg).reduce((a, b) => a + b, 0);
  return `<a class="card block" href="#/progress" id="week-link"><strong>This week</strong> <span class="muted small">${d} / ${t} target hard sets · see per muscle →</span></a>`;
}

function deloadCard() {
  if (inDeload()) return `<div class="card warnb" id="deload-on"><strong>Deload week</strong>
    <p class="small">Half the sets, same weights, stop 3–4 reps short. Volume and loads don't change this week. Ends ${new Date(S.deload.until).toLocaleDateString()}.</p>
    <button class="small" id="deload-end">End deload now</button></div>`;
  const d = deloadSuggestion();
  if (!d.suggest) return "";
  return `<div class="card warnb" id="deload-card"><strong>Deload suggested</strong>
    <p class="small">${esc(d.reason)}${d.stalled?.length ? ` (${d.stalled.map(exName).join(", ")})` : ""}. A lighter week lets fatigue drop so you can keep progressing: half the sets, same weights, 3–4 reps in reserve.</p>
    <div class="row"><button id="deload-start">Start deload week</button><button id="deload-snooze">Not now</button></div></div>`;
}
function wireDeload() {
  const st = $("#deload-start"), sn = $("#deload-snooze"), en = $("#deload-end");
  if (st) st.onclick = () => { S.deload = { start: Date.now(), until: Date.now() + 7 * DAY }; save(); render(); };
  if (sn) sn.onclick = () => { S.deloadSnoozeUntil = Date.now() + 7 * DAY; save(); render(); };
  if (en) en.onclick = () => { S.deload.until = Date.now(); inDeload(); save(); render(); };
}

const planFor = (idx) => { const p = program(), i = idx % p.length; return plannedSets(p[i], S.weeklySets, muscleFrequency(p), { deload: inDeload(), ordinal: muscleOrdinal(p, i) }); };
// Xplosiv supplement clearance page: the red X floated at the top right of the exercise list, level with exercises 2-5
// (the list text wraps around it, so long names never run under it). Opens outside the app (new tab / the phone's browser).
const XPLOSIV_URL = "https://xplosiv.nz/clearance.html";
/** Mon–Sun strip for Today: training days filled, rest days dim, today ringed. Same markup on every copy (themes style it). */
function weekStripHTML(sched, now) {
  return `<ol class="wk" id="week-strip" aria-label="This week's training and rest days">${weekStrip(sched, now).map((d) =>
    `<li class="${d.train ? "wk-on" : "wk-off"}${d.today ? " wk-now" : ""}"${d.today ? ' aria-current="date"' : ""}><span aria-hidden="true">${d.letter}</span><i class="vh">${d.name}: ${d.train ? "training" : "rest"}${d.today ? " (today)" : ""}</i></li>`).join("")}</ol>`;
}
const REST_LINE = "Recover and eat big: hit your protein and calories.";
function today() {
  const s = session(), plan = planFor(S.nextSession);
  // Rest day = today isn't one of the training days and no workout is in progress. The rotation is unchanged: the next
  // session is still S.nextSession, it just waits for the next training day (or "Train anyway" starts it now).
  const now = new Date(), sched = scheduleFor(S.profile), restDay = !S.active && !isTrainingDay(sched, now);
  const rest = restDay ? { line: REST_LINE, next: s.name, when: whenText(nextTrainingDay(sched, now)) } : null;
  const strip = weekStripHTML(sched, now);
  const totalSets = Object.values(plan).reduce((a, b) => a + b, 0);
  const meta = `<div class="muted small">Next session · ${S.profile.days} days/week · ${esc(EQUIPMENT[S.profile.equipment]?.label)}</div>`;
  const big = `<div class="big">${esc(s.name)} · ${CONFIG.theme ? `<span class="hs">${totalSets} hard sets</span>` : `${totalSets} hard sets`}</div>`;
  const xp = `<span class="xpw"><a class="xp" id="xplosiv" href="${XPLOSIV_URL}" target="_blank" rel="noopener" aria-label="Xplosiv clearance deals"><img src="${CONFIG.assetBase}img/xplosiv-x.svg" alt="" width="101" height="76"></a></span>`;
  const list = `<ul class="small exlist">${s.exercises.map((e) => `<li>${esc(e.name)} <span class="muted">${plan[e.id]}×${e.reps[0]}–${e.reps[1]}</span></li>`).join("")}</ul>`;
  const startLabel = S.active ? "Resume workout" : restDay ? `Train anyway: ${esc(s.name)}` : "Start workout";
  const ios = !isStandalone() && isIOS() ? `<p class="small muted">iPhone: Share → Add to Home Screen to install.</p>` : "";
  // A themed friend copy (themes/<name>/theme.js) may lay out the Today page itself; it gets the same pieces and the
  // same #start button wiring below. Unthemed copies never define GJ_THEME, so their markup is unchanged.
  const themed = globalThis.GJ_THEME?.today;
  const ex0 = s.exercises[0];
  view.innerHTML = themed ? themed({
    esc, name: s.name, totalSets, startLabel, active: !!S.active, rest, strip,
    first: ex0 && { sets: plan[ex0.id], reps: ex0.reps, rir: inDeload() ? "3–4" : "1–2", restMin: Math.round(restSeconds(ex0) / 30) / 2 },
    deload: deloadCard(), session: `<div class="card hero">${meta}${big}${xp}${list}</div>`,
    sessionNoX: `<div class="card hero">${meta}${big}${list}</div>`, xplosiv: { url: XPLOSIV_URL, img: `${CONFIG.assetBase}img/xplosiv-x.svg` },
    week: weekSummaryLine(), nutrition: nutritionCard(), ios,
  }) : `
  <h1>${rest ? "Rest day" : `Today: ${esc(s.name)}`}</h1>
  ${deloadCard()}
  <div class="card hero">
    ${strip}
    ${rest ? `<p class="rd-line" id="rest-line">${rest.line}</p><p class="rd-next" id="rest-next">Next: <b>${esc(rest.next)}</b> ${rest.when}</p>` : ""}
    ${meta}
    ${big}
    ${xp}
    ${list}
    <button class="primary" id="start" style="margin-top:10px">${startLabel}</button>
  </div>
  ${weekSummaryLine()}
  ${nutritionCard()}
  ${ios}`;
  $("#start").onclick = () => { if (!S.active) startActive(); go("workout"); };
  wireDeload();
}

function startActive() {
  const p = program(), idx = S.nextSession % p.length, s = p[idx], deload = inDeload();
  const plan = planFor(idx);
  S.active = { sessionIdx: idx, session: { id: s.id, name: s.name, exercises: s.exercises }, startedAt: Date.now(), recovery: "good", deload, rest: null, cur: 0,
    exercises: Object.fromEntries(s.exercises.map((ex) => {
      const w = progression(ex, lastFor(ex.id), { deload }).weight;
      return [ex.id, { sets: Array.from({ length: plan[ex.id] }, () => ({ weight: w, reps: "", rir: "", done: false })) }];
    })) };
  save();
}

let clockTimer = null;
/** One exercise per screen. S.active.cur (persisted) is the exercise being shown. */
function workout() {
  if (!S.active) return workoutPreview();
  const a = S.active, s = a.session, eq = S.profile.equipment;
  const ids = s.exercises.map((e) => e.id), n = s.exercises.length;
  const k = a.cur = clampIndex(a.cur, n), ex = s.exercises[k], isLast = k === n - 1;
  const x = a.exercises[ex.id], last = lastFor(ex.id), pr = progression(ex, last, { deload: a.deload });
  const alts = alternatives(ex.id, eq, ids);
  const next = s.exercises[k + 1];
  const doneSets = Object.values(a.exercises).reduce((t, e) => t + e.sets.filter((q) => q.done).length, 0);
  const allSets = Object.values(a.exercises).reduce((t, e) => t + e.sets.length, 0);
  view.innerHTML = `
  <div class="wtop">
    <div class="wpos"><strong id="ex-pos">${positionLabel(k, n)}</strong><span class="small muted">${esc(s.name)} · <span id="clock"></span></span>
      <button type="button" class="small" id="ex-list">All exercises</button></div>
    <div class="dots" role="tablist" aria-label="Exercises">${s.exercises.map((e, i) => `<button type="button" role="tab" class="dot ${exerciseStatus(a.exercises[e.id].sets)} ${i === k ? "cur" : ""}" data-go="${i}" data-id="${e.id}" aria-selected="${i === k}" aria-label="Exercise ${i + 1}: ${esc(e.name)} (${exerciseStatus(a.exercises[e.id].sets)})"><i></i></button>`).join("")}</div>
  </div>
  <div class="card exscreen" data-ex="${ex.id}" data-k="${k}">
    ${heroHTML(ex)}
    <h1 class="exname">${esc(ex.name)}</h1>
    <div class="targets"><span>${MUSCLES[ex.muscle]}</span><span>${x.sets.length} sets</span><span>${ex.reps[0]}–${ex.reps[1]} reps</span><span>${a.deload ? "RIR 3–4" : "RIR 1–2"}</span><span>rest ${Math.round(restSeconds(ex) / 30) / 2} min</span></div>
    ${a.deload ? `<p class="small warn">Deload week: same weights, half the sets, stop 3–4 reps short.</p>` : ""}
    ${last ? `<div class="small muted last">Last: ${last.sets.filter((q) => q.done).map((q) => `${q.weight || 0}×${q.reps}${q.rir !== "" && q.rir != null ? ` @${q.rir}` : ""}`).join(", ") || "-"}</div>` : ""}
    ${progressIndicator(ex, last, pr, a.deload)}
    ${!last && ex.step > 0 && !a.deload ? `<details class="sw"><summary>Find my starting weight</summary>
      <p class="small muted">Warm up, then do one set close to failure (ideally 3–10 reps) and enter it.</p>
      <div class="row"><input type="number" inputmode="decimal" class="sw-w" placeholder="kg" aria-label="${esc(ex.name)} test set kg"><input type="number" inputmode="numeric" class="sw-r" placeholder="reps" aria-label="${esc(ex.name)} test set reps"><button type="button" class="sw-go">Estimate</button></div>
      <p class="small sw-out"></p></details>` : ""}
    <div class="small sugg ${pr.increase ? "up" : ""}">${esc(pr.text)}</div>
    ${alts.length ? `<button type="button" class="swap-btn" aria-label="Swap ${esc(ex.name)}">⇄ Swap exercise (${alts.length} options)</button>` : ""}
    <div class="set head small muted"><span>#</span><span>${ex.step ? "kg" : "+kg"}</span><span>reps</span><span>RIR</span><span>done</span></div>
    ${x.sets.map((st, i) => `<div class="set">
      <span>${i + 1}</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" data-f="weight" data-i="${i}" value="${esc(st.weight)}" placeholder="${ex.step ? "kg" : "0"}" aria-label="${esc(ex.name)} set ${i + 1} kg">
      <input type="number" inputmode="numeric" min="0" data-f="reps" data-i="${i}" value="${esc(st.reps)}" class="${st.auto ? "auto" : ""}" placeholder="${ex.reps[0]}–${ex.reps[1]}" aria-label="${esc(ex.name)} set ${i + 1} reps">
      <input type="number" inputmode="numeric" min="0" max="10" data-f="rir" data-i="${i}" value="${esc(st.rir)}" placeholder="${a.deload ? "3–4" : "1–2"}" aria-label="${esc(ex.name)} set ${i + 1} reps in reserve">
      <input type="checkbox" data-f="done" data-i="${i}" ${st.done ? "checked" : ""} aria-label="${esc(ex.name)} set ${i + 1} done">
    </div>`).join("")}
    <div class="live small" aria-live="polite">${liveText(ex, x.sets)}</div>
    ${k === 0 && !a.deload ? `<p class="small muted">Take hard sets to 1–2 reps in reserve (RIR). Hit the top of the rep range on every set and the weight goes up next time. Ticking a set starts the rest timer.</p>` : ""}
    ${k === 0 && calibrating() ? calibrationTip() : ""}
  </div>
  ${isLast ? `<div class="card" id="finish-card"><strong>Last exercise. How recovered did you feel today?</strong>
    <div class="seg" id="recovery">${["good", "ok", "poor"].map((r) => `<button type="button" data-r="${r}" class="${a.recovery === r ? "on" : ""}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div>
    <p class="small muted">Good + performance held or up: one set is added next week (at most +1 per muscle per week). Poor or performance down: volume backs off.</p>
    <p class="small" id="finish-count">${doneSets} of ${allSets} sets ticked${doneSets < allSets ? ` <span class="muted">(unticked sets aren't counted)</span>` : ""}</p>
    <p id="finish-err" class="err" hidden>Tick at least one set as done first, or discard the workout.</p>
  </div>` : ""}
  <div class="wnav">
    <button type="button" id="ex-back" ${k === 0 ? "disabled" : ""} aria-label="Back to the previous exercise">← Back</button>
    ${isLast ? `<button class="primary" id="finish">Finish workout</button>` : `<button type="button" class="primary ${exerciseStatus(x.sets) === "done" ? "pulse" : ""}" id="ex-next" aria-label="Next exercise: ${esc(next.name)}">Next exercise →<span class="small">${esc(next.name)}</span></button>`}
  </div>
  <p class="small muted center">Swipe left or right to change exercise.</p>
  <p><button class="small" id="discard">Discard workout</button></p>`;

  const goEx = (i) => { a.cur = clampIndex(i, n); save(); workout(); window.scrollTo(0, 0); };
  view.querySelectorAll(".dots [data-go]").forEach((b) => b.onclick = () => goEx(+b.dataset.go));
  $("#ex-back").onclick = () => goEx(k - 1);
  if ($("#ex-next")) $("#ex-next").onclick = () => goEx(k + 1);
  $("#ex-list").onclick = () => {
    const sh = $("#lightbox");
    sh.innerHTML = `<div class="lb-card sheet" role="dialog" aria-modal="true" aria-label="All exercises">
      <div class="lb-head"><strong>All exercises</strong><button type="button" class="lb-x" aria-label="Close">✕</button></div>
      ${s.exercises.map((e, i) => { const st = a.exercises[e.id].sets, d = st.filter((q) => q.done).length;
        return `<div class="altrow">${thumbHTML(e)}<button type="button" class="ov-pick ${i === k ? "on" : ""}" data-go="${i}"><b>${i + 1}. ${esc(e.name)}</b><span class="small muted">${d}/${st.length} sets done · ${exerciseStatus(st) === "done" ? "✓ done" : exerciseStatus(st) === "partial" ? "in progress" : "to do"}</span></button></div>`; }).join("")}</div>`;
    sh.hidden = false;
    const close = () => { sh.hidden = true; sh.innerHTML = ""; };
    sh.querySelector(".lb-x").onclick = close; sh.onclick = (e) => { if (e.target === sh) close(); };
    sh.querySelectorAll(".ov-pick").forEach((p) => p.onclick = () => { close(); goEx(+p.dataset.go); });
  };
  // optional swipe (ignored when it starts on an input/button, so typing and ticking never change screens)
  const scr = view.querySelector(".exscreen"); let t0 = null;
  scr.addEventListener("touchstart", (e) => { t0 = e.target.closest("input,button,select,summary,details") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  scr.addEventListener("touchend", (e) => {
    if (!t0) return; const t = e.changedTouches[0], d = swipeDir(t.clientX - t0.x, t.clientY - t0.y); t0 = null;
    if (d === -1 && k < n - 1) goEx(k + 1); else if (d === 1 && k > 0) goEx(k - 1);
  }, { passive: true });

  view.querySelectorAll("[data-ex] .set input").forEach((inp) => inp.addEventListener("input", () => {
    const card = inp.closest("[data-ex]");
    const sets = x.sets, i = +inp.dataset.i, st = sets[i], f = inp.dataset.f;
    if (f === "done") {
      st.done = inp.checked;
      if (st.done && (st.reps === "" || st.reps == null)) { // prefill the LOW end; flagged so it never counts as a top-of-range set
        st.reps = ex.reps[0]; st.auto = true;
        const r = inp.parentElement.querySelector('[data-f="reps"]'); r.value = st.reps; r.classList.add("auto");
      }
      if (st.done) { primeAudio(); startRest(restSeconds(ex), i + 1 < sets.length ? `${ex.name}: next set ${i + 2} of ${sets.length}` : next ? `${ex.name} done. Next: ${next.name}` : `${ex.name} done: finish when ready`); }
      const stt = exerciseStatus(sets), dot = view.querySelector(`.dots [data-go="${k}"]`);
      if (dot) { dot.classList.remove("todo", "partial", "done"); dot.classList.add(stt); }
      $("#ex-next")?.classList.toggle("pulse", stt === "done");
      const fc = $("#finish-count"); if (fc) { const dn = Object.values(a.exercises).reduce((t, e) => t + e.sets.filter((q) => q.done).length, 0); fc.textContent = `${dn} of ${allSets} sets ticked`; }
    } else {
      const v = inp.value === "" ? "" : parseFloat(inp.value);
      st[f] = v;
      if (f === "reps") { st.auto = false; inp.classList.remove("auto"); }
      if (f === "weight" && v !== "") { // carry the weight into later sets that are still empty
        sets.forEach((o, j) => { if (j > i && !o.done && (o.weight === "" || o.weight == null)) { o.weight = v; const el = card.querySelector(`[data-f="weight"][data-i="${j}"]`); if (el) el.value = v; } });
      }
    }
    const live = card.querySelector(".live"); if (live) live.innerHTML = liveText(ex, sets);
    save();
  }));
  view.querySelectorAll(".sw-go").forEach((btn) => btn.onclick = () => {
    const card = btn.closest("[data-ex]"), out = card.querySelector(".sw-out");
    const r = startingWeight(ex, card.querySelector(".sw-w").value, card.querySelector(".sw-r").value);
    if (!r) { out.textContent = "Enter the weight and reps (1–30) of your test set."; out.className = "small sw-out err"; return; }
    x.sets.forEach((o, j) => { if (!o.done) { o.weight = r.weight; const el = card.querySelector(`[data-f="weight"][data-i="${j}"]`); if (el) el.value = r.weight; } });
    out.className = "small sw-out";
    out.innerHTML = `Estimated 1RM <b>${r.e1rm} kg</b> (Epley) → work at <b class="up">${r.weight} kg</b>: your ~${r.rm}-rep max, so ${r.targetReps} reps leaves ~2 in reserve. Filled into every set.${r.inaccurate ? ` <span class="warn">Over 12 reps the estimate is rough; adjust after the first set.</span>` : ""}`;
    save();
  });
  view.querySelectorAll(".swap-btn").forEach((btn) => btn.onclick = () => {
    const old = s.exercises[k];
    const sh = $("#lightbox");
    sh.innerHTML = `<div class="lb-card sheet" role="dialog" aria-modal="true" aria-label="Swap ${esc(old.name)}">
      <div class="lb-head"><strong>Swap ${esc(old.name)}</strong><button type="button" class="lb-x" aria-label="Close">✕</button></div>
      <p class="small muted">Same muscle (${MUSCLES[old.muscle]}), works with your equipment. Tap a picture to see it bigger.</p>
      ${alts.map((o) => `<div class="altrow">${thumbHTML(o)}<button type="button" class="alt-pick" data-swap="${o.id}"><b>${esc(o.name)}</b><span class="small muted">${o.reps[0]}–${o.reps[1]} reps · ${o.kind === "C" ? "compound" : "isolation"}</span></button></div>`).join("")}</div>`;
    sh.hidden = false;
    const close = () => { sh.hidden = true; sh.innerHTML = ""; };
    sh.querySelector(".lb-x").onclick = close; sh.onclick = (e) => { if (e.target === sh) close(); };
    sh.querySelectorAll(".alt-pick").forEach((p) => p.onclick = () => { close(); doSwap(k, p.dataset.swap); });
  });
  const doSwap = (k, nid) => {
    const old = s.exercises[k];
    if (!nid || !LIBRARY[nid]) return;
    const n = a.exercises[old.id].sets.length, deload = a.deload;
    const w = progression(LIBRARY[nid], lastFor(nid), { deload }).weight;
    s.exercises[k] = { ...LIBRARY[nid], slot: old.slot };
    const ex2 = {}; // keep exercise order
    for (const e of s.exercises) ex2[e.id] = e.id === nid ? { sets: Array.from({ length: n }, () => ({ weight: w, reps: "", rir: "", done: false })) } : a.exercises[e.id];
    a.exercises = ex2;
    if (old.slot) S.swaps[`${s.id}:${old.slot}`] = nid; // remembered for future sessions
    save(); workout();
  };
  view.querySelectorAll("#recovery button").forEach((b) => b.onclick = () => {
    a.recovery = b.dataset.r; save();
    view.querySelectorAll("#recovery button").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#discard").onclick = () => { if (confirm("Discard this workout?")) { S.active = null; save(); restTick(); go("today"); } };
  if ($("#finish")) $("#finish").onclick = finishWorkout;
  clearInterval(clockTimer);
  const tick = () => { const c = $("#clock"); if (!c || !S.active) return clearInterval(clockTimer); c.textContent = Math.floor((Date.now() - S.active.startedAt) / 60000) + " min"; };
  tick(); clockTimer = setInterval(tick, 15000);
}

/** First week of training (no history, or first workout under 7 days ago) = calibration week. */
const calibrating = () => !S.history.length || Date.now() - Date.parse(S.history[0].date) < 7 * DAY;
const calibrationTip = () => `<div class="card warnb" id="calib"><strong>Calibration week</strong>
  <p class="small">Warm up with 2–3 lighter sets. Pick a weight you can lift for the rep range with 1–2 reps left, and adjust it set to set. New exercise? Tap <b>Find my starting weight</b>. Next week the app takes over the numbers.</p></div>`;
// ---------- exercise images (rendering lives in media.js) ----------
function openPhoto(id) {
  const ex = LIBRARY[id], html = ex && photoHTML(ex); if (!html) return;
  const lb = $("#photo"); lb.innerHTML = html; lb.hidden = false;
  const close = () => { lb.hidden = true; lb.innerHTML = ""; };
  lb.querySelector(".lb-x").onclick = close; lb.onclick = (e) => { if (e.target === lb) close(); };
  lb.querySelector(".lb-x").focus();
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const top = !$("#photo").hidden ? $("#photo") : !$("#lightbox").hidden ? $("#lightbox") : null;
  if (top) { top.hidden = true; top.innerHTML = ""; }
});
document.addEventListener("click", (e) => { const b = e.target.closest?.(".exthumb[data-img],.exhero[data-img]"); if (b) openPhoto(b.dataset.img); });

const unitW = (ex, w) => (ex.step ? `${w} kg` : w ? `+${w} kg` : "bodyweight");
/** Last session vs the top of the rep range: a bar + "N more reps to go heavier", or the GO HEAVIER badge. */
function progressIndicator(ex, last, pr, deload) {
  if (!last || deload) return "";
  const st = progressStatus(ex, last.sets);
  if (st.earned) return `<div class="prog earned" data-earned="1"><span class="badge">${ex.step ? `GO HEAVIER: ${pr.weight} kg` : "GO HARDER: add load or a harder variation"}</span></div>`;
  const parts = [];
  if (st.missingSets) parts.push(`do all ${last.sets.length} sets`);
  if (st.missingReps) parts.push(`${st.missingReps} more rep${st.missingReps === 1 ? "" : "s"}`);
  if (!parts.length && st.failureSets) parts.push("leave 1 rep in reserve at the top of the range");
  return `<div class="prog" data-earned="0"><div class="pbar"><i style="width:${st.pct}%"></i></div>
    <div class="ptext"><b>${esc(parts.join(" + "))}</b> to go heavier${st.autoSets ? ` <span class="muted">(${st.autoSets} set${st.autoSets === 1 ? "" : "s"} had no reps logged)</span>` : ""}</div></div>`;
}
/** Live, during the session: how far today's ticked sets are from earning the next weight. */
function liveText(ex, sets) {
  const st = progressStatus(ex, sets);
  if (st.earned) return `<span class="earned-now">✓ Earned! Next time: ${esc(unitW(ex, st.nextWeight))}</span>`;
  if (!sets.some((s) => s.done)) return "";
  const left = [st.missingSets && `${st.missingSets} set${st.missingSets === 1 ? "" : "s"} left`, st.missingReps && `${st.missingReps} reps short of the top`].filter(Boolean).join(" · ");
  return `<span class="muted">${esc(left || "Leave 1 rep in reserve at the top to earn more weight")}</span>`;
}

function workoutPreview() {
  const s = session(), deload = inDeload(), plan = planFor(S.nextSession);
  view.innerHTML = `
  <h1>${esc(s.name)}</h1>
  <p class="small muted">Up next. Swap exercises once you start; swaps are remembered.</p>
  ${calibrating() ? calibrationTip() : ""}
  ${s.exercises.map((ex) => `<div class="card slim" data-pv="${ex.id}"><div class="exrow">${thumbHTML(ex)}<div class="exhead"><strong>${esc(ex.name)}</strong>
    <span class="small muted">${plan[ex.id]} sets × ${ex.reps[0]}–${ex.reps[1]} reps · ${MUSCLES[ex.muscle]}</span></div></div>
    ${progressIndicator(ex, lastFor(ex.id), progression(ex, lastFor(ex.id), { deload }), deload)}
    <div class="small sugg">${esc(progression(ex, lastFor(ex.id), { deload }).text)}</div></div>`).join("")}
  <button class="primary" id="start-workout">Start workout</button>
  <p class="small muted">Change days per week or equipment in <a class="tap" href="#/settings">Settings</a>.</p>`;
  $("#start-workout").onclick = () => { startActive(); workout(); };
}

// ---------- rest timer ----------
let actx = null;
function primeAudio() { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch { actx = null; } }
function beep() {
  debug.beeps++;
  if (!actx) return;
  try {
    [0, 0.3, 0.6].forEach((t) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.25, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.22);
      o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.25);
    });
  } catch { /* audio is best effort */ }
}
async function restDoneAlert() {
  beep();
  if (navigator.vibrate) { navigator.vibrate([300, 120, 300]); debug.vibrations++; }
  if (document.hidden && permissionState() === "granted") { // phone in pocket: a quiet system notification too
    try { const r = await navigator.serviceWorker?.ready; await r?.showNotification("Rest over: next set", { tag: "rest", vibrate: [300, 120, 300], data: { url: "./#/workout" } }); } catch { /* ignore */ }
  }
}
function startRest(sec, label) {
  if (!S.active) return;
  S.active.rest = { endAt: Date.now() + sec * 1000, total: sec, label, fired: false };
  save(); restTick();
}
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function restTick() {
  const bar = $("#rest"), r = S.active?.rest;
  if (!r || !S.profile || !isUnlocked()) { bar.hidden = true; document.body.classList.remove("resting"); return; }
  const left = r.endAt - Date.now();
  bar.hidden = false; document.body.classList.add("resting");
  if (left <= 0) {
    if (!r.fired) { r.fired = true; r.firedAt = Date.now(); save(); restDoneAlert(); }
    $("#rest-time").textContent = "Go!"; $("#rest-label").textContent = "Rest over: next set";
    bar.classList.add("over"); $("#rest-fill").style.width = "100%";
    if (Date.now() - (r.firedAt || 0) > 5000) { S.active.rest = null; save(); restTick(); }
    return;
  }
  bar.classList.remove("over");
  $("#rest-time").textContent = fmt(left);
  $("#rest-label").textContent = r.label || "Rest";
  $("#rest-fill").style.width = `${Math.min(100, 100 * (1 - left / (r.total * 1000)))}%`;
}
function adjustRest(d) {
  const r = S.active?.rest; if (!r || r.fired) return;
  r.endAt = Math.max(Date.now() + 5000, r.endAt + d * 1000); r.total = Math.max(r.total + d, 5); save(); restTick();
}
$("#rest-minus").onclick = () => adjustRest(-15);
$("#rest-plus").onclick = () => adjustRest(15);
$("#rest-skip").onclick = () => { if (S.active) { S.active.rest = null; save(); restTick(); } };
setInterval(restTick, 250);
document.addEventListener("visibilitychange", restTick);

/** The finish flow. Exposed for tests. Kicks off the notification request inside the tap. */
export async function finishWorkout() {
  const a = S.active; if (!a) return;
  const s = a.session;
  const hardSets = Object.values(a.exercises).reduce((n, x) => n + x.sets.filter((st) => st.done).length, 0);
  if (!hardSets) { const e = $("#finish-err"); if (e) e.hidden = false; return { mode: "none", reason: "no-sets" }; }
  const durationMin = (Date.now() - a.startedAt) / 60000;
  const pw = postWorkout(S.profile.bodyweightKg, { hardSets, durationMin });
  const notifying = sendPostWorkout(pw); // permission prompt happens here, still inside the tap

  const doneByMuscle = {};
  for (const ex of s.exercises) doneByMuscle[ex.muscle] = (doneByMuscle[ex.muscle] || 0) + (a.exercises[ex.id]?.sets.filter((st) => st.done).length || 0);
  // Auto-regulate each muscle trained, using its first (main) lift that was done. At most +1 set per muscle per week.
  const volume = [], seen = new Set(), wk = weekKey();
  for (const ex of s.exercises) {
    if (seen.has(ex.muscle) || !doneByMuscle[ex.muscle]) continue;
    const main = s.exercises.find((e) => e.muscle === ex.muscle && a.exercises[e.id].sets.some((q) => q.done)) || ex;
    seen.add(ex.muscle);
    const now = e1rm(a.exercises[main.id].sets), last = lastFor(main.id);
    const prev = last ? e1rm(last.sets) : 0;
    const perf = now > 0 && prev > 0 ? (now - prev) / prev : null;
    const before = S.weeklySets[ex.muscle];
    let after = before, reason;
    if (a.deload) reason = "deload: hold";
    else {
      const r = autoregulate(before, perf, a.recovery, SET_RANGE[ex.muscle]);
      if (r.delta > 0 && S.volAdjWeek[ex.muscle] === wk) reason = "hold (already +1 this week)";
      else { after = r.weeklySets; reason = r.reason; if (r.delta > 0 && after > before) S.volAdjWeek[ex.muscle] = wk; }
    }
    S.weeklySets[ex.muscle] = after;
    volume.push({ muscle: ex.muscle, lift: main.name, perf, before, after, reason });
  }
  const prs = [];
  for (const ex of s.exercises) {
    const now = e1rm(a.exercises[ex.id].sets);
    const best = Math.max(0, ...e1rmSeries(S.history, ex.id).map((p) => p.e1rm));
    if (now > 0 && best > 0 && now > best) prs.push({ name: ex.name, e1rm: now, prev: best });
  }
  S.history.push({ date: new Date().toISOString(), session: s.id, name: s.name, durationMin: Math.round(durationMin), hardSets, recovery: a.recovery, deload: !!a.deload, exercises: a.exercises });
  S.nextSession = (a.sessionIdx + 1) % program().length;
  S.active = null;
  S.lastSummary = { pw, volume, prs, session: s.name, at: Date.now(), mode: "pending" };
  save(); restTick();
  const res = await notifying;
  S.lastSummary.mode = res.mode; S.lastSummary.permission = res.permission; save();
  go("summary");
  return res;
}

function summary() {
  const L = S.lastSummary;
  if (!L) { view.innerHTML = `<h1>No workout yet</h1><p><a href="#/today">Go to today's session</a></p>`; return; }
  const { pw } = L, n = notificationText(pw), card = L.mode !== "notified";
  view.innerHTML = `
  <h1>${esc(L.session)} done</h1>
  ${card ? `<div class="card hero" id="fallback-card" data-mode="card">
      <div class="muted small">Post-workout meal, within ~2 hours</div>
      <div class="big">${pw.proteinG} g protein + ${pw.carbG} g carbs</div>
      <p class="small muted">${L.permission === "denied" ? "Notifications are blocked, so here's your summary. Turn them on in Chrome's site settings to get it on your phone." : "Notifications aren't available here, so here's your summary."}</p>
    </div>` : `<div class="card hero" id="notify-status" data-mode="notified">
      <div class="small ok">Sent to your phone's notifications</div>
      <div class="big">${pw.proteinG} g protein + ${pw.carbG} g carbs</div>
      <p class="small muted">${esc(n.body)}</p></div>`}
  ${L.prs?.length ? `<div class="card" id="prs"><strong>New bests (estimated 1RM)</strong><ul class="small">${L.prs.map((p) => `<li>${esc(p.name)}: <b>${p.e1rm} kg</b> <span class="muted">(was ${p.prev})</span></li>`).join("")}</ul></div>` : ""}
  <div class="card"><strong>How that was worked out</strong>
    <code class="calc">${esc(calcText(pw))}</code>
    <p class="small"><a class="tap" href="#/why">Why this works →</a></p></div>
  <div class="card"><strong>Volume for next week (auto-regulated)</strong>
    <table>${L.volume.map((v) => `<tr><td>${MUSCLES[v.muscle]}</td><td style="white-space:nowrap">${v.before} → <b>${v.after}</b></td><td class="${v.after > v.before ? "up" : v.after < v.before ? "down" : "muted"}">${esc(v.reason)}${v.perf === null ? "" : ` (${v.perf >= 0 ? "+" : ""}${(v.perf * 100).toFixed(1)}% e1RM)`}</td></tr>`).join("")}</table></div>
  <button class="primary" id="summary-done">Done</button>`;
  $("#summary-done").onclick = () => go("today");
}

function calcText(pw) {
  return `Protein: ${pw.bodyweightKg} kg × ${pw.proteinGPerKg} g/kg = ${pw.proteinG} g
  (2.2 g/kg/day ÷ 4 meals; minimum 0.4 g/kg = ${pw.proteinMinG} g)
Carbs:   ${pw.bodyweightKg} kg × ${pw.carbGPerKg} g/kg = ${pw.carbG} g
  scale 0.5 → 1.0 g/kg by the larger of
  volume   ${pw.hardSets} sets  (10→30 sets)  = ${pw.volFactor}
  duration ${pw.durationMin} min (30→90 min) = ${pw.durFactor}
  0.5 + 0.5 × ${pw.factor} = ${pw.carbGPerKg} g/kg`;
}

// ---------- progress: weekly tracker, chart, history ----------
function trackerCard() {
  const done = weeklyDone(S.history, (id) => LIBRARY[id]?.muscle), tg = weeklyTargets();
  const from = new Date(weekStart());
  return `<div class="card" id="tracker"><strong>This week's hard sets</strong> <span class="small muted">since Mon ${from.toLocaleDateString()}${inDeload() ? " · deload targets" : ""}</span>
    <div class="trk">${Object.keys(MUSCLES).map((m) => {
      const d = done[m] || 0, t = tg[m], pct = Math.min(100, Math.round(100 * d / t));
      return `<div class="trow" data-m="${m}"><span class="tname">${MUSCLES[m]}</span><span class="tbar"><i style="width:${pct}%" class="${d >= t ? "full" : ""}"></i></span><span class="tnum"><b>${d}</b>/${t}</span></div>`;
    }).join("")}</div>
    <p class="small muted">Done = sets ticked this week (Mon–Sun). Target = your auto-regulated weekly sets: major muscles 10–20, glutes / rear delts / abs 6–12 direct.</p></div>`;
}
function chartSVG(points, unit) {
  const W = 320, H = 160, P = 30;
  if (!points.length) return "";
  const ys = points.map((p) => p.v), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const x = (i) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
  const y = (v) => H - P + 10 - ((v - lo) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const d0 = new Date(points[0].t), d1 = new Date(points[points.length - 1].t);
  return `<svg id="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Progress chart">
    <line x1="${P}" y1="${H - P + 10}" x2="${W - P}" y2="${H - P + 10}" stroke="#374151"/>
    <text x="2" y="${y(hi) + 4}" fill="#9ca3af" font-size="11">${hi}</text><text x="2" y="${y(lo) + 4}" fill="#9ca3af" font-size="11">${lo}</text>
    <path d="${path}" fill="none" stroke="#f97316" stroke-width="2.5"/>
    ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="#f97316"><title>${new Date(p.t).toLocaleDateString()}: ${p.v} ${unit}</title></circle>`).join("")}
    <text x="${P}" y="${H - 2}" fill="#9ca3af" font-size="11">${d0.toLocaleDateString()}</text>
    <text x="${W - P}" y="${H - 2}" fill="#9ca3af" font-size="11" text-anchor="end">${d1.toLocaleDateString()}</text></svg>`;
}
let chartEx = null;
function progress() {
  const ids = [...new Set(S.history.flatMap((h) => Object.keys(h.exercises).filter((id) => h.exercises[id].sets.some((q) => q.done))))];
  if (!ids.includes(chartEx)) chartEx = ids[0] || null;
  let pts = [], unit = "kg e1RM";
  if (chartEx) {
    pts = e1rmSeries(S.history, chartEx).map((p) => ({ t: p.t, v: p.e1rm }));
    if (!pts.length) { unit = "best reps"; pts = S.history.filter((h) => h.exercises[chartEx]).map((h) => ({ t: Date.parse(h.date), v: Math.max(0, ...h.exercises[chartEx].sets.filter((q) => q.done).map((q) => Number(q.reps) || 0)) })).filter((p) => p.v > 0); }
  }
  const delta = pts.length > 1 ? +(pts[pts.length - 1].v - pts[0].v).toFixed(1) : null;
  view.innerHTML = `
  <h1>Progress</h1>
  ${trackerCard()}
  ${deloadCard()}
  <div class="card"><strong>Progress chart</strong>
    ${ids.length ? `<select id="chart-ex" aria-label="Exercise">${ids.map((id) => opt(id, exName(id), chartEx)).join("")}</select>
    <p class="small muted">Best ${unit === "best reps" ? "reps" : "estimated 1RM (Epley)"} per session${delta !== null ? ` · <b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta} ${unit === "best reps" ? "reps" : "kg"}</b> since the first` : ""}</p>
    ${chartSVG(pts, unit)}` : `<p class="small muted">Finish a workout to see your progress here.</p>`}
  </div>
  <h2>History</h2>
  <div id="history">${S.history.length ? S.history.slice().reverse().map((h) => `<details class="card hist"><summary><b>${esc(h.name || h.session)}</b> <span class="small muted">${new Date(h.date).toLocaleDateString()} · ${h.hardSets} sets · ${h.durationMin} min${h.deload ? " · deload" : ""}</span></summary>
      <ul class="small">${Object.entries(h.exercises).filter(([, x]) => x.sets.some((q) => q.done)).map(([id, x]) => `<li>${esc(exName(id))}: ${x.sets.filter((q) => q.done).map((q) => `${q.weight || 0}×${q.reps}${q.rir !== "" && q.rir != null ? ` @${q.rir}` : ""}`).join(", ")}</li>`).join("")}</ul></details>`).join("") : `<p class="small muted">No workouts yet.</p>`}</div>`;
  const sel = $("#chart-ex"); if (sel) sel.onchange = () => { chartEx = sel.value; progress(); };
  wireDeload();
}

function why() {
  const kg = S.profile?.bodyweightKg ?? 80;
  const t = dailyTargets({ ...(S.profile || { bodyweightKg: kg }), kcalAdjust: S.kcalAdjust });
  const pw = S.lastSummary?.pw ?? postWorkout(kg, { hardSets: 24, durationMin: 75 });
  view.innerHTML = `
  <h1>Why this works</h1>
  <p class="muted">Every number is set to build as much muscle as possible without piling on needless fat. The rules are
  taken from the research below; where Get Jacked uses its own rule of thumb, it says so.</p>

  <h2>1. Post-workout meal</h2>
  <div class="card">
    <code class="calc">${esc(calcText(pw))}</code>
    <p class="small">${S.lastSummary ? "From your last session." : `Example: ${kg} kg, 24 sets, 75 min.`}</p>
    <ul class="small">
      <li><b>Protein 0.4–0.55 g/kg per meal, ≥4 meals a day.</b> Schoenfeld & Aragon (2018) conclude 0.4 g/kg/meal over at least four meals, and up to 0.55 g/kg/meal to reach 2.2 g/kg/day. Get Jacked uses the upper value, 0.55, because the goal is maximum muscle.</li>
      <li><b>Carbs 0.5–1.0 g/kg, more after bigger sessions.</b> The ISSN position stand (Kerksick 2017) gives 0.6–1.0 g/kg within 30 min of a glycogen-depleting session for fast glycogen refill, and notes lifting does use glycogen (6 sets of 12RM leg extensions cut quad glycogen by 39%). Lifting sessions usually deplete less than long endurance work, so the 0.5 floor for short sessions and the linear scale up to 1.0 are Get Jacked's own rule of thumb, not a tested protocol. Total daily carbs matter more than timing.</li>
    </ul>
  </div>

  <h2>2. Daily nutrition: a lean bulk</h2>
  <div class="card small">
    <code class="calc">Calories: ${t.goalGiven ? `your goal ${t.kcal}` : `${t.maintenance}${t.maintenanceIsEstimate ? ` (est. ${kg} kg × ${E.roughMaintenanceKcalPerKg})` : ""} × ${1 + t.surplus}${S.kcalAdjust ? ` ${S.kcalAdjust > 0 ? "+" : ""}${S.kcalAdjust} weigh-in adj.` : ""} = ${t.kcal} kcal`}
Protein:  ${kg} × ${+(t.proteinG / kg).toFixed(2)} = ${t.proteinG} g
Fat:      ${kg} × ${+(t.fatG / kg).toFixed(2)} = ${t.fatG} g
Carbs:    the rest = ${t.carbG} g (floor ${kg} × 3 = ${t.carbMinG} g)
Target gain: ${t.weeklyGainKg[0]}–${t.weeklyGainKg[1]} kg/week (0.25–0.5%)</code>
    <ul>
      <li><b>Surplus +10–20% (advanced +5–10%), gaining ~0.25–0.5% of bodyweight a week.</b> Iraki et al. (2019), off-season bodybuilding review. Get Jacked defaults to +15%. Log weigh-ins in Settings: each week, if you gained under 0.25% it adds 150 kcal; over 0.5% it trims 100 kcal, never below maintenance +5%. The 150/100 steps and the ${E.roughMaintenanceKcalPerKg} kcal/kg starting estimate are Get Jacked's own rules of thumb; the weigh-ins correct them.</li>
      <li><b>Protein 2.2 g/kg/day.</b> Morton et al. (2018) meta-analysis of 49 trials: gains in fat-free mass levelled off around 1.6 g/kg/day, but the 95% confidence interval reached 2.2 g/kg/day, so 2.2 covers nearly everyone. Iraki 2019 also recommends 1.6–2.2.</li>
      <li><b>Fat 0.5–1.5 g/kg, carbs ≥3–5 g/kg.</b> Iraki et al. (2019). The rest of the calories go to carbs to fuel training. If you set your own lower calorie goal, the macros still add up: fat drops toward 0.6 g/kg first, then carbs, and protein stays at 2.2 g/kg as long as possible.</li>
    </ul>
  </div>

  <h2>3. Training volume, auto-regulated</h2>
  <div class="card small"><ul>
    <li><b>More sets, more growth, up to a point.</b> Schoenfeld, Ogborn & Krieger (2017): a graded dose–response, with 10+ weekly sets per muscle doing best. Baz-Valle et al. (2022), trained lifters: 12–20 weekly sets per muscle (at ~2×/week) as the standard target, with >20 better only for triceps.</li>
    <li><b>Get Jacked:</b> every major muscle at least twice a week (3 days: full body; 4: upper/lower; 5: upper/lower + push/pull/legs; 6: push/pull/legs twice), 10–20 sets/week. Glutes, rear delts and abs already get heavy indirect work, so their direct work runs 6–12 sets. After each session: performance held or up and recovery "Good" → +1 set (at most once per muscle per week); performance down more than 2.5% (estimated 1RM) or recovery "Poor" → −2 sets. These step sizes are Get Jacked's own rule, not from a study.</li>
    <li><b>Effort: 1–2 reps in reserve.</b> Refalo et al. (2023): training close to failure builds muscle, but going all the way to failure adds little; logging RIR keeps sets hard enough to count.</li>
    <li><b>Rest 2–3 min on compounds, ~1.5 min on isolations.</b> Schoenfeld et al. (2016): 3-minute rests built more muscle than 1-minute rests in trained men. The timer starts when you tick a set.</li>
    <li><b>Progression:</b> double progression. When every set reaches the top of the rep range (with reps you actually typed), the load goes up by the smallest sensible jump (2 kg for dumbbells, 2.5 kg for barbells and cables); otherwise beat your reps first.</li>
    <li><b>Deload:</b> about every 6 weeks, or sooner if your main lifts stall for 2 sessions, Get Jacked suggests a week at half the sets and the same weights. That timing is a common coaching rule of thumb, not a tested protocol.</li>
  </ul></div>

  <h2>Sources</h2>
  <ol class="small refs">
    <li>Schoenfeld BJ, Aragon AA. How much protein can the body use in a single meal for muscle-building? <i>J Int Soc Sports Nutr</i> 2018;15:10. <a href="https://doi.org/10.1186/s12970-018-0215-1">doi:10.1186/s12970-018-0215-1</a></li>
    <li>Morton RW et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. <i>Br J Sports Med</i> 2018;52(6):376–384. <a href="https://doi.org/10.1136/bjsports-2017-097608">doi:10.1136/bjsports-2017-097608</a></li>
    <li>Kerksick CM et al. ISSN position stand: nutrient timing. <i>J Int Soc Sports Nutr</i> 2017;14:33. <a href="https://doi.org/10.1186/s12970-017-0189-4">doi:10.1186/s12970-017-0189-4</a></li>
    <li>Iraki J et al. Nutrition recommendations for bodybuilders in the off-season: a narrative review. <i>Sports</i> 2019;7(7):154. <a href="https://doi.org/10.3390/sports7070154">doi:10.3390/sports7070154</a></li>
    <li>Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. <i>J Sports Sci</i> 2017;35(11):1073–1082. <a href="https://doi.org/10.1080/02640414.2016.1210197">doi:10.1080/02640414.2016.1210197</a></li>
    <li>Baz-Valle E et al. A systematic review of the effects of different resistance training volumes on muscle hypertrophy. <i>J Hum Kinet</i> 2022;81:199–210. <a href="https://doi.org/10.2478/hukin-2022-0017">doi:10.2478/hukin-2022-0017</a></li>
    <li>Refalo MC et al. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. <i>Sports Med</i> 2023;53(3):649–665. <a href="https://doi.org/10.1007/s40279-022-01784-y">doi:10.1007/s40279-022-01784-y</a></li>
    <li>Schoenfeld BJ et al. Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men. <i>J Strength Cond Res</i> 2016;30(7):1805–1812. <a href="https://doi.org/10.1519/JSC.0000000000001272">doi:10.1519/JSC.0000000000001272</a></li>
  </ol>
  <p class="small muted" id="photo-credit">Exercise illustrations generated for Get Jacked.</p>
  <p class="small muted">General guidance for healthy adults, not medical advice.</p>`;
}

function settings() {
  const p = S.profile;
  view.innerHTML = `
  <h1>Settings</h1>
  <div class="card">${profileForm(p, { days: "row" })}<p id="st-err" class="err" hidden></p>
    <button class="primary" id="st-save" style="margin-top:12px">Save</button> <span id="st-ok" class="small ok"></span></div>
  <div class="card"><strong>Weigh-in</strong>
    <p class="small muted">Weigh yourself a few mornings a week. Weekly averages keep your gain at ${E.gainMinPctPerWeek}–${E.gainMaxPctPerWeek}% a week.</p>
    <div class="row"><input id="wi" type="number" inputmode="decimal" step="0.1" placeholder="kg" aria-label="Weigh-in kg"><button id="wi-add">Log</button></div>
    <p id="wi-msg" class="small"></p>
    <p class="small muted" id="wi-list">${S.weighIns.slice(-7).map((w) => `${w.date}: ${w.kg} kg`).join(" · ")}</p></div>
  <div class="card"><strong>Notifications</strong>
    <p class="small">Status: <b id="perm">${permissionState()}</b></p>
    <div class="row"><button id="perm-btn">Allow notifications</button><button id="perm-test">Send a test</button></div></div>
  <div class="card"><strong>Backup</strong>
    <p class="small muted">Your data lives only on this phone. Export a JSON backup now and then; import it on a new phone.</p>
    <div class="row"><button id="export">Export backup</button><label class="btn" for="import">Import backup</label></div>
    <input id="import" type="file" accept="application/json,.json" hidden>
    <p id="bk-msg" class="small"></p></div>
  <div class="card small muted">Install on Android: open in Chrome → tap <b>Install app</b> (top right) or ⋮ → <b>Install app</b>.<br>
    iPhone: Safari → Share → Add to Home Screen.</div>
  <div class="row"><button id="lock-app">Lock app</button></div>
  <p><button class="small" id="reset">Reset all data</button></p>`;
  $("#lock-app").onclick = () => { localStorage.removeItem(LOCK_KEY); go("today"); };
  // Training days: the count must match the split (Save is blocked with a clear message otherwise); sessions that train
  // the same muscles on consecutive days only get a gentle warning. Changing the split picks its recommended days.
  const tdShow = (sched) => { for (const b of view.querySelectorAll(".td-day")) { const on = sched.includes(+b.dataset.d); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); } tdCheck(); };
  const tdPicked = () => [...view.querySelectorAll(".td-day.on")].map((b) => +b.dataset.d);
  function tdCheck() {
    const days = +$("#days").value, sched = tdPicked(), c = checkSchedule(sched, days), msg = $("#td-msg"), warn = $("#td-warn");
    const rec = sameSchedule(sched, defaultSchedule(days));
    msg.className = "small " + (c.ok ? "muted" : "err");
    msg.textContent = c.ok ? `${c.count} of ${c.need} days picked${rec ? " (recommended)" : ""}.` : c.message;
    const text = c.ok ? backToBackText(backToBack(buildProgram({ days, equipment: $("#equip").value, experience: $("#exp").value, swaps: S.swaps }), sched)) : "";
    warn.textContent = text; warn.hidden = !text;
    $("#td-reset").disabled = rec;
  }
  view.querySelectorAll(".td-day").forEach((b) => { b.onclick = () => { b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); $("#st-ok").textContent = ""; tdCheck(); }; });
  $("#td-reset").onclick = () => tdShow(defaultSchedule(+$("#days").value));
  $("#days").onchange = () => tdShow(defaultSchedule(+$("#days").value));
  tdCheck();
  $("#st-save").onclick = () => {
    const r = readProfile(); if (r.error) { $("#st-err").textContent = r.error; $("#st-err").hidden = false; return; }
    const np = r.profile, changed = np.days !== p.days || np.equipment !== p.equipment || np.experience !== p.experience;
    $("#st-err").hidden = true; S.profile = np;
    if (np.days !== p.days) S.nextSession = 0;
    const daysChanged = !sameSchedule(np.schedule, scheduleFor(p));
    save(); $("#st-ok").textContent = (changed ? `Saved. New program: ${program().map((s) => s.name).join(", ")}` : "Saved") + (daysChanged ? `. Training days: ${dayList(np.schedule)}` : "");
  };
  $("#wi-add").onclick = () => {
    const kg = parseFloat($("#wi").value); if (!validBodyweight(kg)) { $("#wi-msg").textContent = "Enter 30–250 kg."; return; }
    const today = localDate();
    S.weighIns = S.weighIns.filter((w) => w.date !== today).concat({ date: today, kg });
    S.profile.bodyweightKg = kg;
    const msg = weeklyCheck(); save();
    settings(); // refresh the bodyweight field and the weigh-in list so a later Save can't revert it
    $("#wi-msg").textContent = msg || "Logged.";
  };
  $("#perm-btn").onclick = async () => { $("#perm").textContent = await ensurePermission(); };
  $("#perm-test").onclick = async () => {
    const r = await sendPostWorkout(postWorkout(S.profile.bodyweightKg, { hardSets: 24, durationMin: 75 }));
    $("#perm").textContent = r.permission + (r.mode === "notified" ? " (test sent)" : " (not sent)");
  };
  $("#export").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "get-jacked", exportedAt: new Date().toISOString(), data: S }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `get-jacked-backup-${localDate()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $("#bk-msg").textContent = `Exported ${S.history.length} workouts.`;
  };
  $("#import").onchange = (e) => importBackup(e, () => { settings(); $("#bk-msg").textContent = `Imported ${S.history.length} workouts.`; });
  $("#reset").onclick = () => { if (confirm("Delete all Get Jacked data on this phone?")) { localStorage.removeItem(KEY); S = fresh(); go("onboarding"); } };
}

async function importBackup(e, after) {
  const f = e.target.files[0]; if (!f) return;
  let data;
  try { const j = JSON.parse(await f.text()); data = migrate(j && j.app === "get-jacked" ? j.data : j); } catch { data = null; }
  e.target.value = "";
  if (!data || !data.profile || !validBodyweight(data.profile.bodyweightKg)) { $("#bk-msg").textContent = "That file isn't a Get Jacked backup."; $("#bk-msg").className = "small err"; return; }
  if (!confirm(`Replace all data on this phone with the backup (${data.history.length} workouts)?`)) return;
  S = data; save(); after();
}

function weeklyCheck() {
  const now = Date.now();
  if (now - S.lastKcalAdjustAt < 7 * DAY) return "";
  const avg = (from, to) => { const xs = S.weighIns.filter((w) => { const t = Date.parse(w.date); return t > now - from * DAY && t <= now - to * DAY; }).map((w) => w.kg); return xs.length ? xs.reduce((a, b) => a + b) / xs.length : 0; };
  const r = calorieAdjust(avg(14, 7), avg(7, -1), S.kcalAdjust, minKcalAdjust(S.profile));
  if (r.ratePct === null) return "";
  S.kcalAdjust = r.kcalAdjust; S.lastKcalAdjustAt = now;
  return r.change > 0 ? `Gaining ${r.ratePct}%/wk, under target: +${r.change} kcal/day.` : r.change < 0 ? `Gaining ${r.ratePct}%/wk, faster than needed: ${r.change} kcal/day.` : r.ratePct > E.gainMaxPctPerWeek ? `Gaining ${r.ratePct}%/wk, faster than needed, but calories are already at the bulk floor (maintenance +5%).` : `Gaining ${r.ratePct}%/wk: right on target.`;
}

render();
