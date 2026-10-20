import { EVIDENCE as E, dailyTargets, postWorkout, notificationText, e1rm, autoregulate, calorieAdjust, plannedSets, validBodyweight, minKcalAdjust, localDate } from "./calc.js";
import { SESSIONS, MUSCLES, START_WEEKLY_SETS } from "./program.js";
import { sendPostWorkout, ensurePermission, permissionState } from "./notify.js";

const KEY = "massplan.v1";
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function fresh() {
  return { profile: null, weeklySets: { ...START_WEEKLY_SETS }, nextSession: 0, history: [], weighIns: [],
    kcalAdjust: 0, lastKcalAdjustAt: 0, active: null, lastSummary: null };
}
let S = load() || fresh();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
window.__massplan = { get state() { return S; } }; // for tests / debugging

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
const session = () => SESSIONS[S.nextSession % SESSIONS.length];
const lastFor = (exId) => { for (let i = S.history.length - 1; i >= 0; i--) { const x = S.history[i].exercises[exId]; if (x) return x; } return null; };
function suggestWeight(ex) {
  const last = lastFor(ex.id);
  if (!last) return "";
  const done = last.sets.filter((s) => s.done && s.weight > 0);
  if (!done.length) return "";
  const w = Math.max(...done.map((s) => s.weight));
  const hitTop = done.length >= last.sets.length && done.every((s) => s.reps >= ex.reps[1]);
  return hitTop ? +(w + ex.step).toFixed(2) : w; // double progression: top of rep range on every set -> add load
}
function targets() { return dailyTargets({ ...S.profile, kcalAdjust: S.kcalAdjust }); }

// ---------- views ----------
const routes = { onboarding, today, workout, summary, why, settings };
function render() {
  let r = (location.hash.replace(/^#\//, "") || "today").split("?")[0];
  if (!S.profile && r !== "why") r = "onboarding";
  if (!routes[r]) r = "today";
  $("#nav").hidden = r === "onboarding";
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + r));
  routes[r]();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);
const go = (r) => { if (location.hash === "#/" + r) render(); else location.hash = "#/" + r; };

function profileForm(p = {}) {
  return `
  <label for="bw">Bodyweight (kg) *</label>
  <input id="bw" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${esc(p.bodyweightKg ?? "")}" required>
  <label for="exp">Training experience</label>
  <select id="exp">${["novice", "intermediate", "advanced"].map((x) => `<option ${p.experience === x || (!p.experience && x === "intermediate") ? "selected" : ""}>${x}</option>`).join("")}</select>
  <p class="small muted">Novice/intermediate bulk at +15% above maintenance; advanced at +7.5% (Iraki 2019).</p>
  <label for="maint">Maintenance calories (optional)</label>
  <input id="maint" type="number" inputmode="numeric" placeholder="Leave blank to estimate" value="${esc(p.maintenanceKcal ?? "")}">
  <label for="goal">Daily calorie goal (optional, overrides the bulk default)</label>
  <input id="goal" type="number" inputmode="numeric" placeholder="Blank = lean-bulk default" value="${esc(p.calorieGoal ?? "")}">`;
}
function readProfile() {
  const bw = parseFloat($("#bw").value);
  if (!validBodyweight(bw)) return null;
  const num = (id) => { const v = parseFloat($(id).value); return v > 0 ? v : null; };
  return { bodyweightKg: bw, experience: $("#exp").value, maintenanceKcal: num("#maint"), calorieGoal: num("#goal") };
}

function onboarding() {
  view.innerHTML = `
  <h1>Let's build muscle</h1>
  <p class="muted">Get Jacked has one job: help you put on as much muscle as possible. It sets a lean-bulk surplus,
  high protein, high-but-recoverable training volume, and tells you what to eat after every session.</p>
  <div class="card">${profileForm()}
  <p id="ob-err" class="err" hidden>Enter your bodyweight in kg (30-250). It drives every protein and carb number.</p></div>
  <div class="card">
    <strong>Post-workout notifications</strong>
    <p class="small muted">When you tap Finish workout, Get Jacked sends a notification with exactly how much protein and carbs to eat.</p>
    <button id="ob-notif" type="button">Allow notifications</button> <span id="ob-notif-state" class="small muted"></span>
  </div>
  <button id="ob-go" class="primary">Start bulking</button>`;
  const showState = () => { $("#ob-notif-state").textContent = { granted: "On", denied: "Blocked: you'll get an in-app card instead", default: "", unsupported: "Not supported here: in-app card instead" }[permissionState()]; };
  showState();
  $("#ob-notif").onclick = async () => { await ensurePermission(); showState(); };
  $("#ob-go").onclick = () => {
    const p = readProfile();
    if (!p) { $("#ob-err").hidden = false; return; }
    S.profile = p; S.weighIns.push({ date: localDate(), kg: p.bodyweightKg }); save(); go("today");
  };
}

function today() {
  const t = targets(), s = session(), plan = plannedSets(s, S.weeklySets);
  const totalSets = Object.values(plan).reduce((a, b) => a + b, 0);
  view.innerHTML = `
  <h1>Today: ${esc(s.name)}</h1>
  <div class="card hero">
    <div class="muted small">Next session</div>
    <div class="big">${esc(s.name)} · ${totalSets} hard sets</div>
    <button class="primary" id="start" style="margin-top:10px">${S.active ? "Resume workout" : "Start workout"}</button>
  </div>
  <div class="card">
    <strong>Daily bulk targets</strong>
    <table>
      <tr><td>Calories</td><td><b>${t.kcal}</b> kcal ${t.goalGiven ? "(your goal)" : `(maintenance ${t.maintenance}${t.maintenanceIsEstimate ? " est." : ""} +${+(t.surplus * 100).toFixed(1)}%${S.kcalAdjust ? `, ${S.kcalAdjust > 0 ? "+" : ""}${S.kcalAdjust} weigh-in adj.` : ""})`}</td></tr>
      <tr><td>Protein</td><td><b>${t.proteinG} g</b> (2.2 g/kg, over 4+ meals)</td></tr>
      <tr><td>Carbs</td><td><b>${t.carbG} g</b> (at least ${t.carbMinG} g)</td></tr>
      <tr><td>Fat</td><td><b>${t.fatG} g</b></td></tr>
      <tr><td>Weight gain</td><td>${t.weeklyGainKg[0]}–${t.weeklyGainKg[1]} kg / week</td></tr>
    </table>
    ${t.carbBelowFloor ? `<p class="small warn">Your calorie goal is low for a bulk: carbs are set to the ${t.carbMinG} g floor.</p>` : ""}
  </div>
  ${!isStandalone() && isIOS() ? `<p class="small muted">iPhone: Share → Add to Home Screen to install.</p>` : ""}`;
  $("#start").onclick = () => go("workout");
}

function startActive() {
  const s = session(), plan = plannedSets(s, S.weeklySets);
  S.active = { sessionIdx: S.nextSession, startedAt: Date.now(), recovery: "good",
    exercises: Object.fromEntries(s.exercises.map((ex) => {
      const w = suggestWeight(ex);
      return [ex.id, { sets: Array.from({ length: plan[ex.id] }, () => ({ weight: w, reps: "", done: false })) }];
    })) };
  save();
}

let timer = null;
function workout() {
  if (!S.active) startActive();
  const s = SESSIONS[S.active.sessionIdx % SESSIONS.length];
  view.innerHTML = `
  <h1>${esc(s.name)} <span class="small muted" id="clock"></span></h1>
  <p class="small muted">Take hard sets to ~1–2 reps from failure. Hit the top of the rep range on every set and the weight goes up next time.</p>
  ${s.exercises.map((ex) => {
    const a = S.active.exercises[ex.id], last = lastFor(ex.id);
    return `<div class="card" data-ex="${ex.id}">
      <strong>${esc(ex.name)}</strong> <span class="small muted">${MUSCLES[ex.muscle]} · ${ex.reps[0]}–${ex.reps[1]} reps</span>
      ${last ? `<div class="small muted">Last: ${last.sets.filter((x) => x.done).map((x) => `${x.weight}×${x.reps}`).join(", ") || "-"}</div>` : ""}
      <div class="set small muted"><span>#</span><span>kg</span><span>reps</span><span>done</span></div>
      ${a.sets.map((st, i) => `<div class="set">
        <span>${i + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" data-f="weight" data-i="${i}" value="${esc(st.weight)}" aria-label="${esc(ex.name)} set ${i + 1} kg">
        <input type="number" inputmode="numeric" data-f="reps" data-i="${i}" value="${esc(st.reps)}" placeholder="${ex.reps[1]}" aria-label="${esc(ex.name)} set ${i + 1} reps">
        <input type="checkbox" data-f="done" data-i="${i}" ${st.done ? "checked" : ""} aria-label="${esc(ex.name)} set ${i + 1} done">
      </div>`).join("")}
    </div>`;
  }).join("")}
  <div class="card"><strong>How recovered did you feel today?</strong>
    <div class="seg" id="recovery">${["good", "ok", "poor"].map((r) => `<button type="button" data-r="${r}" class="${S.active.recovery === r ? "on" : ""}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div>
    <p class="small muted">Good + performance held or up: a set is added next week. Poor or performance down: volume backs off.</p>
  </div>
  <p id="finish-err" class="err" hidden>Tick at least one set as done first, or discard the workout.</p>
  <button class="primary" id="finish">Finish workout</button>
  <p><button class="small" id="discard">Discard workout</button></p>`;

  view.querySelectorAll("[data-ex] input").forEach((inp) => inp.addEventListener("input", () => {
    const exId = inp.closest("[data-ex]").dataset.ex, st = S.active.exercises[exId].sets[+inp.dataset.i];
    if (inp.dataset.f === "done") {
      st.done = inp.checked;
      if (st.done && !st.reps) { const ex = s.exercises.find((e) => e.id === exId); st.reps = ex.reps[1]; inp.parentElement.querySelector('[data-f="reps"]').value = st.reps; }
    } else st[inp.dataset.f] = inp.value === "" ? "" : parseFloat(inp.value);
    save();
  }));
  view.querySelectorAll("#recovery button").forEach((b) => b.onclick = () => {
    S.active.recovery = b.dataset.r; save();
    view.querySelectorAll("#recovery button").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#discard").onclick = () => { if (confirm("Discard this workout?")) { S.active = null; save(); go("today"); } };
  $("#finish").onclick = finishWorkout;
  clearInterval(timer);
  const tick = () => { const c = $("#clock"); if (!c || !S.active) return clearInterval(timer); c.textContent = Math.floor((Date.now() - S.active.startedAt) / 60000) + " min"; };
  tick(); timer = setInterval(tick, 15000);
}

/** The finish flow. Exposed for tests. Kicks off the notification request inside the tap. */
export async function finishWorkout() {
  const a = S.active; if (!a) return;
  const s = SESSIONS[a.sessionIdx % SESSIONS.length];
  const durationMin = (Date.now() - a.startedAt) / 60000;
  const hardSets = Object.values(a.exercises).reduce((n, x) => n + x.sets.filter((st) => st.done).length, 0);
  if (!hardSets) { const e = $("#finish-err"); if (e) e.hidden = false; return { mode: "none", reason: "no-sets" }; }
  const doneByMuscle = {};
  for (const ex of s.exercises) doneByMuscle[ex.muscle] = (doneByMuscle[ex.muscle] || 0) + (a.exercises[ex.id]?.sets.filter((st) => st.done).length || 0);
  const pw = postWorkout(S.profile.bodyweightKg, { hardSets, durationMin });
  const notifying = sendPostWorkout(pw); // permission prompt happens here, still inside the tap

  // Auto-regulate each muscle trained, using its first (main) lift.
  const volume = [];
  const seen = new Set();
  for (const ex of s.exercises) {
    if (seen.has(ex.muscle)) continue; seen.add(ex.muscle);
    if (!doneByMuscle[ex.muscle]) continue; // skipped muscle: no volume change
    const now = e1rm(a.exercises[ex.id].sets), last = lastFor(ex.id);
    const prev = last ? e1rm(last.sets) : 0;
    const perf = now > 0 && prev > 0 ? (now - prev) / prev : null;
    const before = S.weeklySets[ex.muscle];
    const r = autoregulate(before, perf, a.recovery);
    S.weeklySets[ex.muscle] = r.weeklySets;
    volume.push({ muscle: ex.muscle, lift: ex.name, perf, before, after: r.weeklySets, reason: r.reason });
  }
  S.history.push({ date: new Date().toISOString(), session: s.id, durationMin: Math.round(durationMin), hardSets, recovery: a.recovery, exercises: a.exercises });
  S.nextSession = (a.sessionIdx + 1) % SESSIONS.length;
  S.active = null;
  S.lastSummary = { pw, volume, session: s.name, at: Date.now(), mode: "pending" };
  save();
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
  <div class="card"><strong>How that was worked out</strong>
    <code class="calc">${esc(calcText(pw))}</code>
    <p class="small"><a href="#/why">Why this works →</a></p></div>
  <div class="card"><strong>Volume for next week (auto-regulated)</strong>
    <table>${L.volume.map((v) => `<tr><td>${MUSCLES[v.muscle]}</td><td style="white-space:nowrap">${v.before} → <b>${v.after}</b> sets/wk</td><td class="${v.after > v.before ? "up" : v.after < v.before ? "down" : "muted"}">${v.reason}${v.perf === null ? " (first time)" : ` (${v.perf >= 0 ? "+" : ""}${(v.perf * 100).toFixed(1)}% e1RM)`}</td></tr>`).join("")}</table></div>
  <button class="primary" onclick="location.hash='#/today'">Done</button>`;
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
Protein:  ${kg} × 2.2 = ${t.proteinG} g
Fat:      ${kg} × 1.0 = ${t.fatG} g
Carbs:    the rest = ${t.carbG} g (floor ${kg} × 3 = ${t.carbMinG} g)
Target gain: ${t.weeklyGainKg[0]}–${t.weeklyGainKg[1]} kg/week (0.25–0.5%)</code>
    <ul>
      <li><b>Surplus +10–20% (advanced +5–10%), gaining ~0.25–0.5% of bodyweight a week.</b> Iraki et al. (2019), off-season bodybuilding review. Get Jacked defaults to +15%. Log weigh-ins in Settings: each week, if you gained under 0.25% it adds 150 kcal; over 0.5% it trims 100 kcal, never below maintenance +5%. The 150/100 steps and the ${E.roughMaintenanceKcalPerKg} kcal/kg starting estimate are Get Jacked's own rules of thumb; the weigh-ins correct them.</li>
      <li><b>Protein 2.2 g/kg/day.</b> Morton et al. (2018) meta-analysis of 49 trials: gains in fat-free mass levelled off around 1.6 g/kg/day, but the 95% confidence interval reached 2.2 g/kg/day, so 2.2 covers nearly everyone. Iraki 2019 also recommends 1.6–2.2.</li>
      <li><b>Fat 0.5–1.5 g/kg, carbs ≥3–5 g/kg.</b> Iraki et al. (2019). The rest of the calories go to carbs to fuel training.</li>
    </ul>
  </div>

  <h2>3. Training volume, auto-regulated</h2>
  <div class="card small"><ul>
    <li><b>More sets, more growth, up to a point.</b> Schoenfeld, Ogborn & Krieger (2017): a graded dose–response, with 10+ weekly sets per muscle doing best. Baz-Valle et al. (2022), trained lifters: 12–20 weekly sets per muscle (at ~2×/week) as the standard target, with >20 better only for triceps.</li>
    <li><b>Get Jacked:</b> every muscle twice a week, starting high in that range (big muscles 12–14 sets, arms/delts/calves 10 plus indirect work). After each session: performance held or up and recovery "Good" → +1 set/week; performance down more than 2.5% (estimated 1RM) or recovery "Poor" → −2 sets; capped at 10–20. These step sizes are Get Jacked's own rule, not from a study.</li>
    <li><b>Exercises:</b> big compound lifts first, then isolations that load each muscle through a full range. Load goes up when every set hits the top of the rep range.</li>
  </ul></div>

  <h2>Sources</h2>
  <ol class="small">
    <li>Schoenfeld BJ, Aragon AA. How much protein can the body use in a single meal for muscle-building? <i>J Int Soc Sports Nutr</i> 2018;15:10. <a href="https://doi.org/10.1186/s12970-018-0215-1">doi:10.1186/s12970-018-0215-1</a></li>
    <li>Morton RW et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. <i>Br J Sports Med</i> 2018;52(6):376–384. <a href="https://doi.org/10.1136/bjsports-2017-097608">doi:10.1136/bjsports-2017-097608</a></li>
    <li>Kerksick CM et al. ISSN position stand: nutrient timing. <i>J Int Soc Sports Nutr</i> 2017;14:33. <a href="https://doi.org/10.1186/s12970-017-0189-4">doi:10.1186/s12970-017-0189-4</a></li>
    <li>Iraki J et al. Nutrition recommendations for bodybuilders in the off-season: a narrative review. <i>Sports</i> 2019;7(7):154. <a href="https://doi.org/10.3390/sports7070154">doi:10.3390/sports7070154</a></li>
    <li>Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. <i>J Sports Sci</i> 2017;35(11):1073–1082. <a href="https://doi.org/10.1080/02640414.2016.1210197">doi:10.1080/02640414.2016.1210197</a></li>
    <li>Baz-Valle E et al. A systematic review of the effects of different resistance training volumes on muscle hypertrophy. <i>J Hum Kinet</i> 2022;81:199–210. <a href="https://doi.org/10.2478/hukin-2022-0017">doi:10.2478/hukin-2022-0017</a></li>
  </ol>
  <p class="small muted">General guidance for healthy adults, not medical advice.</p>`;
}

function settings() {
  const p = S.profile;
  view.innerHTML = `
  <h1>Settings</h1>
  <div class="card">${profileForm(p)}<p id="st-err" class="err" hidden>Bodyweight must be 30–250 kg.</p>
    <button class="primary" id="st-save" style="margin-top:12px">Save</button> <span id="st-ok" class="small ok"></span></div>
  <div class="card"><strong>Weigh-in</strong>
    <p class="small muted">Weigh yourself a few mornings a week. Weekly averages keep your gain at ${E.gainMinPctPerWeek}–${E.gainMaxPctPerWeek}% a week.</p>
    <div class="row"><input id="wi" type="number" inputmode="decimal" step="0.1" placeholder="kg"><button id="wi-add">Log</button></div>
    <p id="wi-msg" class="small"></p>
    <p class="small muted">${S.weighIns.slice(-7).map((w) => `${w.date}: ${w.kg} kg`).join(" · ")}</p></div>
  <div class="card"><strong>Notifications</strong>
    <p class="small">Status: <b id="perm">${permissionState()}</b></p>
    <button id="perm-btn">Allow notifications</button>
    <button id="perm-test">Send a test</button></div>
  <div class="card"><strong>Weekly sets per muscle</strong>
    <table>${Object.entries(S.weeklySets).map(([m, n]) => `<tr><td>${MUSCLES[m]}</td><td>${n}</td></tr>`).join("")}</table></div>
  <div class="card small muted">Install on Android: open in Chrome → tap <b>Install app</b> (top right) or ⋮ → <b>Install app</b>.<br>
    iPhone: Safari → Share → Add to Home Screen.</div>
  <p><button class="small" id="reset">Reset all data</button></p>`;
  $("#st-save").onclick = () => {
    const np = readProfile(); if (!np) { $("#st-err").hidden = false; return; }
    $("#st-err").hidden = true; S.profile = np; save(); $("#st-ok").textContent = "Saved";
  };
  $("#wi-add").onclick = () => {
    const kg = parseFloat($("#wi").value); if (!validBodyweight(kg)) return;
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
  $("#reset").onclick = () => { if (confirm("Delete all Get Jacked data on this phone?")) { localStorage.removeItem(KEY); S = fresh(); go("onboarding"); } };
}

function weeklyCheck() {
  const DAY = 864e5, now = Date.now();
  if (now - S.lastKcalAdjustAt < 7 * DAY) return "";
  const avg = (from, to) => { const xs = S.weighIns.filter((w) => { const t = Date.parse(w.date); return t > now - from * DAY && t <= now - to * DAY; }).map((w) => w.kg); return xs.length ? xs.reduce((a, b) => a + b) / xs.length : 0; };
  const r = calorieAdjust(avg(14, 7), avg(7, -1), S.kcalAdjust, minKcalAdjust(S.profile));
  if (r.ratePct === null) return "";
  S.kcalAdjust = r.kcalAdjust; S.lastKcalAdjustAt = now;
  return r.change > 0 ? `Gaining ${r.ratePct}%/wk, under target: +${r.change} kcal/day.` : r.change < 0 ? `Gaining ${r.ratePct}%/wk, faster than needed: ${r.change} kcal/day.` : r.ratePct > E.gainMaxPctPerWeek ? `Gaining ${r.ratePct}%/wk, faster than needed, but calories are already at the bulk floor (maintenance +5%).` : `Gaining ${r.ratePct}%/wk: right on target.`;
}

render();
