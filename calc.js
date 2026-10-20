// Pure, testable maths for Get Jacked. No DOM. Imported by app.js and by the Node tests.
// Every default is biased toward one goal: maximum muscle mass.

export const EVIDENCE = {
  proteinDailyGPerKg: 2.2,      // Morton 2018 (break point 1.62, upper 95% CI 2.2); Iraki 2019: 1.6-2.2
  proteinDailyMinGPerKg: 1.6,
  proteinPerMealMinGPerKg: 0.4, // Schoenfeld & Aragon 2018: 0.4 g/kg/meal x >=4 meals
  proteinPerMealMaxGPerKg: 0.55,//   ... 2.2 g/kg/day over 4 meals = 0.55 g/kg/meal
  mealsPerDay: 4,
  carbPostMinGPerKg: 0.5,       // app heuristic floor for short/low-volume lifting sessions
  carbPostMaxGPerKg: 1.0,       // ISSN 2017 (Kerksick): 0.6-1.0 g/kg within 30 min of a glycogen-depleting bout
  carbDailyMinGPerKg: 3,        // Iraki 2019: carbs >= 3-5 g/kg/day in the off-season
  fatDailyGPerKg: 1.0,          // Iraki 2019: 0.5-1.5 g/kg/day (mid value)
  fatDailyMinGPerKg: 0.6,       //   floor used only when a low calorie goal forces it (just above Iraki's 0.5)
  surplusDefault: 0.15,         // Iraki 2019: +10-20% above maintenance (novice/intermediate)
  surplusAdvanced: 0.075,       //   advanced: +5-10%
  gainMinPctPerWeek: 0.25,      // Iraki 2019: ~0.25-0.5% bodyweight / week
  gainMaxPctPerWeek: 0.5,
  roughMaintenanceKcalPerKg: 35,// rough starting estimate only; corrected by weekly weigh-ins
  setsMin: 10, setsMax: 20,     // Schoenfeld 2017: >=10 sets/muscle/week; Baz-Valle 2022: 12-20 optimal
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round5 = (x) => Math.round(x / 5) * 5;

export function validBodyweight(kg) {
  const n = Number(kg);
  return Number.isFinite(n) && n >= 30 && n <= 250;
}

/**
 * Daily targets for a lean bulk. profile: {bodyweightKg, calorieGoal?, maintenanceKcal?, experience?, kcalAdjust?}
 * Macros always add up to the calorie figure (within rounding). Protein 2.2 g/kg comes first; if a low calorie goal
 * can't fit fat 1.0 g/kg plus carbs 3 g/kg, fat is trimmed (to 0.6 g/kg), then carbs; then protein (to 1.6 g/kg).
 */
export function dailyTargets(profile) {
  const kg = Number(profile.bodyweightKg);
  if (!validBodyweight(kg)) throw new Error("bodyweight (kg) is required, 30-250");
  const E = EVIDENCE;
  const surplus = profile.experience === "advanced" ? E.surplusAdvanced : E.surplusDefault;
  const maintenance = Number(profile.maintenanceKcal) > 0
    ? Number(profile.maintenanceKcal)
    : kg * E.roughMaintenanceKcalPerKg;
  const maintenanceIsEstimate = !(Number(profile.maintenanceKcal) > 0);
  const goalGiven = Number(profile.calorieGoal) > 0;
  const kcal = goalGiven ? Number(profile.calorieGoal) : round5(maintenance * (1 + surplus)) + (profile.kcalAdjust || 0);
  // Bulk floor: the weigh-in correction can trim the surplus but never take you under maintenance +5%.
  let kcalFinal = goalGiven ? kcal : Math.max(kcal, round5(maintenance * 1.05));
  const carbMinG = Math.round(kg * E.carbDailyMinGPerKg);
  let proteinG = Math.round(kg * E.proteinDailyGPerKg);
  let fatG = Math.round(kg * E.fatDailyGPerKg);
  const fatMinG = Math.round(kg * E.fatDailyMinGPerKg);
  let carbG = (kcalFinal - proteinG * 4 - fatG * 9) / 4;
  if (carbG < carbMinG) { // trim fat toward its floor to protect carbs
    fatG = Math.max(fatMinG, Math.floor((kcalFinal - proteinG * 4 - carbMinG * 4) / 9));
    carbG = (kcalFinal - proteinG * 4 - fatG * 9) / 4;
  }
  let goalTooLow = false;
  if (carbG < 0) { // not even protein + minimum fat fit: lower protein toward 1.6 g/kg, then clamp the goal
    carbG = 0;
    proteinG = Math.max(Math.round(kg * E.proteinDailyMinGPerKg), Math.floor((kcalFinal - fatG * 9) / 4));
    const minKcal = proteinG * 4 + fatG * 9;
    if (minKcal > kcalFinal) { kcalFinal = minKcal; goalTooLow = true; }
  }
  carbG = Math.round(Math.max(0, (kcalFinal - proteinG * 4 - fatG * 9) / 4));
  return {
    kcal: kcalFinal, maintenance: Math.round(maintenance), maintenanceIsEstimate, goalGiven, surplus,
    proteinG, fatG, carbG, carbMinG, fatMinG,
    carbBelowFloor: carbG < carbMinG, fatReduced: fatG < Math.round(kg * E.fatDailyGPerKg),
    belowMaintenance: goalGiven && kcalFinal < Math.round(maintenance), goalTooLow,
    weeklyGainKg: [+(kg * E.gainMinPctPerWeek / 100).toFixed(2), +(kg * E.gainMaxPctPerWeek / 100).toFixed(2)],
  };
}

/**
 * Post-workout meal. session: {hardSets, durationMin}
 * Protein: one of your ~4 daily meals at the 2.2 g/kg/day target = 0.55 g/kg (floor 0.4 g/kg).
 * Carbs: 0.5 -> 1.0 g/kg, scaled by session volume (10 -> 30 hard sets) or duration (30 -> 90 min),
 * whichever is larger. The top of the scale matches the ISSN 0.6-1.0 g/kg glycogen guidance.
 */
export function postWorkout(bodyweightKg, session) {
  const kg = Number(bodyweightKg);
  if (!validBodyweight(kg)) throw new Error("bodyweight (kg) is required, 30-250");
  const E = EVIDENCE;
  const sets = Math.max(0, Number(session.hardSets) || 0);
  const mins = Math.max(0, Number(session.durationMin) || 0);
  const volFactor = clamp((sets - 10) / 20, 0, 1);
  const durFactor = clamp((mins - 30) / 60, 0, 1);
  const factor = Math.max(volFactor, durFactor);
  const carbGPerKg = +(E.carbPostMinGPerKg + (E.carbPostMaxGPerKg - E.carbPostMinGPerKg) * factor).toFixed(2);
  const proteinGPerKg = E.proteinDailyGPerKg / E.mealsPerDay; // 0.55
  return {
    proteinG: Math.round(kg * proteinGPerKg),
    proteinMinG: Math.round(kg * E.proteinPerMealMinGPerKg),
    proteinGPerKg: +proteinGPerKg.toFixed(2),
    carbG: Math.round(kg * carbGPerKg),
    carbGPerKg, factor: +factor.toFixed(2), volFactor: +volFactor.toFixed(2), durFactor: +durFactor.toFixed(2),
    hardSets: sets, durationMin: Math.round(mins), bodyweightKg: kg,
  };
}

export function notificationText(pw) {
  return {
    title: `Workout done: eat ${pw.proteinG} g protein + ${pw.carbG} g carbs`,
    body: `Within ~2 h, to keep building muscle. ${pw.hardSets} hard sets, ${pw.durationMin} min, ` +
      `${pw.bodyweightKg} kg -> ${pw.proteinGPerKg} g/kg protein, ${pw.carbGPerKg} g/kg carbs. Tap for the why.`,
  };
}

/** Epley estimated 1RM of the best completed set. */
export function e1rm(sets) {
  let best = 0;
  for (const s of sets || []) {
    if (!s.done) continue;
    const w = Number(s.weight) || 0, r = Number(s.reps) || 0;
    if (w > 0 && r > 0) best = Math.max(best, w * (1 + r / 30));
  }
  return +best.toFixed(1);
}

/**
 * Auto-regulate weekly sets for one muscle after a session that trained it.
 * perfChange: fractional change in e1RM of that muscle's main lift vs last time (null if no history).
 * recovery: "good" | "ok" | "poor".
 * Rule (app heuristic, inside the evidence-based 10-20 sets/week range):
 *   performance dropped >2.5% or recovery poor -> -2 sets; performance held/up and recovery good -> +1 set; else hold.
 */
export function autoregulate(weeklySets, perfChange, recovery, range = [EVIDENCE.setsMin, EVIDENCE.setsMax]) {
  let delta = 0, reason = "hold";
  if (recovery === "poor" || (perfChange !== null && perfChange < -0.025)) { delta = -2; reason = "back off"; }
  else if (recovery === "good" && (perfChange === null || perfChange >= 0)) { delta = 1; reason = "add a set"; }
  return { weeklySets: clamp(weeklySets + delta, range[0], range[1]), delta, reason };
}

/** Weekly weigh-in correction. Keeps the gain rate inside 0.25-0.5% bodyweight/week; never drops below maintenance. */
export function calorieAdjust(prevWeekAvgKg, thisWeekAvgKg, currentAdjust = 0, minAdjust = -Infinity) {
  const E = EVIDENCE;
  if (!(prevWeekAvgKg > 0 && thisWeekAvgKg > 0)) return { kcalAdjust: currentAdjust, change: 0, ratePct: null };
  const ratePct = ((thisWeekAvgKg - prevWeekAvgKg) / prevWeekAvgKg) * 100;
  let change = 0;
  if (ratePct < E.gainMinPctPerWeek) change = 150;
  else if (ratePct > E.gainMaxPctPerWeek) change = -100;
  // Never let the stored adjustment sink below the bulk floor (maintenance +5%), or later +150 steps would be swallowed.
  const base = change > 0 ? Math.max(currentAdjust, minAdjust) : currentAdjust;
  const kcalAdjust = Math.max(base + change, Math.min(currentAdjust, minAdjust));
  return { kcalAdjust, change: kcalAdjust - currentAdjust, ratePct: +ratePct.toFixed(2) };
}

/** Lowest weigh-in adjustment that still changes anything: the one that lands exactly on the maintenance +5% floor. */
export function minKcalAdjust(profile) {
  const t = dailyTargets({ ...profile, kcalAdjust: 0 });
  return round5(t.maintenance * 1.05) - t.kcal;
}

/** Local calendar date as YYYY-MM-DD (toISOString() would give the UTC date, a day behind in NZ mornings). */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Planned sets per exercise this session: the muscle's weekly sets split over the sessions that train it
 * (freq, default 2x/week), then across its exercises. A deload halves it.
 */
export function plannedSets(session, weeklySetsByMuscle, freq = {}, { deload = false, ordinal = {} } = {}) {
  const byMuscle = {};
  for (const ex of session.exercises) (byMuscle[ex.muscle] ||= []).push(ex);
  const out = {};
  for (const [m, list] of Object.entries(byMuscle)) {
    // ordinal[m] = which of the muscle's weekly sessions this is, so the week adds up exactly (e.g. 10 over 3 = 4+3+3)
    const w = weeklySetsByMuscle[m] ?? 12, f = freq[m] || 2;
    let remaining = Math.max(list.length, Math.floor(w / f) + ((ordinal[m] ?? 0) < w % f ? 1 : 0));
    if (deload) remaining = Math.max(list.length, Math.ceil(remaining / 2));
    list.forEach((ex, i) => {
      const n = Math.ceil(remaining / (list.length - i));
      out[ex.id] = Math.max(1, n); remaining -= n;
    });
  }
  return out;
}

/**
 * Starting-weight helper for an exercise with no history. One test set (ideally near failure) -> Epley e1RM,
 * then the load for (bottom of the rep range + 2) reps max, so working sets land at ~2 RIR with room to progress.
 * Rounded down to the available jump: 2 kg dumbbells, 2.5 kg barbell/machine/cable.
 */
export function startingWeight(ex, testWeight, testReps) {
  const w = Number(testWeight), r = Math.round(Number(testReps));
  if (!(w > 0 && r >= 1 && r <= 30)) return null;
  const est = w * (1 + r / 30);
  const rm = ex.reps[0] + 2;
  const inc = ex.eq === "d" ? 2 : 2.5;
  const weight = Math.max(inc, Math.floor((est / (1 + rm / 30)) / inc + 1e-9) * inc);
  return { e1rm: +est.toFixed(1), rm, targetReps: ex.reps[0], weight: +weight.toFixed(2), inc, inaccurate: r > 12 };
}

/** Rest between sets: heavy compounds 3 min, other compounds 2.5 min, isolations 1.5 min. */
export function restSeconds(ex) {
  if (ex.kind === "C") return ex.reps[0] <= 6 ? 180 : 150;
  return 90;
}

/**
 * How close a session's sets are to earning a load increase (double progression).
 * Earned = every planned set done, with reps actually typed (not auto-filled) at the top of the range,
 * and at the target effort (RIR, if logged, of at least 1: a grinder to failure doesn't count yet).
 * missingReps = reps still needed across the done sets to reach the top on every one.
 */
export function progressStatus(ex, sets = []) {
  const top = ex.reps[1], n = sets.length;
  let have = 0, missingReps = 0, missingSets = 0, autoSets = 0, failureSets = 0;
  for (const s of sets) {
    if (!s.done) { missingSets++; continue; }
    const r = Number(s.reps) || 0; // auto-filled reps count toward the gap but never toward "earned"
    if (s.auto) autoSets++;
    have += Math.min(r, top); missingReps += Math.max(0, top - r);
    if (r >= top && s.rir !== "" && s.rir != null && Number(s.rir) < 1) failureSets++;
  }
  const earned = n > 0 && !missingSets && !missingReps && !failureSets && !autoSets;
  const w = Math.max(0, ...sets.filter((s) => s.done).map((s) => Number(s.weight) || 0));
  return { earned, missingReps, missingSets, autoSets, failureSets, pct: n ? Math.round((100 * have) / (top * n)) : 0,
    nextWeight: earned && ex.step > 0 ? +(w + ex.step).toFixed(2) : w || "" };
}

/**
 * Double progression from last time's sets. Only reps actually typed count (auto-filled reps never trigger
 * an increase). Every planned set done at the top of the rep range -> add `step` kg (or, with no load step,
 * a harder variation / added load). Otherwise keep the weight and beat the reps.
 */
export function progression(ex, last, { deload = false } = {}) {
  const sets = last?.sets || [];
  const done = sets.filter((s) => s.done);
  if (!done.length) return { weight: "", increase: false, text: `First time: pick a load you can lift for ${ex.reps[0]}–${ex.reps[1]} reps with 1–2 in reserve.` };
  const w = Math.max(0, ...done.map((s) => Number(s.weight) || 0));
  const top = ex.reps[1];
  const real = done.filter((s) => !s.auto && Number(s.reps) > 0);
  const allTop = progressStatus(ex, sets).earned;
  const easy = real.some((s) => s.rir !== "" && s.rir != null && Number(s.rir) >= 4);
  if (deload) return { weight: w || "", increase: false, text: "Deload: same weight, half the sets, stop 3–4 reps short." };
  if (allTop && ex.step > 0) return { weight: +(w + ex.step).toFixed(2), increase: true, text: `Hit ${top} on every set: +${ex.step} kg today, aim for ${ex.reps[0]}+ reps.` };
  if (allTop) return { weight: w || "", increase: true, text: `Hit ${top} on every set: add load (backpack/band) or a harder variation.` };
  const why = real.length < done.length ? "Log your reps so the app can move the weight up. " : "";
  return { weight: w || "", increase: false, text: `${why}Same weight: beat last time's reps, up to ${top} on every set.${easy ? " Some sets were easy (RIR 4+): go closer to failure." : ""}` };
}

/** Local Monday 00:00 of the week containing t (ms). */
export function weekStart(t = Date.now()) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export const weekKey = (t = Date.now()) => localDate(new Date(weekStart(t)));

/** Hard sets actually done per muscle this week. muscleOf(exId) -> muscle. */
export function weeklyDone(history, muscleOf, now = Date.now()) {
  const from = weekStart(now), out = {};
  for (const h of history || []) {
    const t = Date.parse(h.date);
    if (!(t >= from && t <= now + 864e5)) continue;
    for (const [id, x] of Object.entries(h.exercises || {})) {
      const m = muscleOf(id); if (!m) continue;
      out[m] = (out[m] || 0) + (x.sets || []).filter((s) => s.done).length;
    }
  }
  return out;
}

/** Best estimated 1RM per session for one exercise: [{t, e1rm}] oldest first. */
export function e1rmSeries(history, exId) {
  return (history || []).filter((h) => h.exercises?.[exId]).map((h) => ({ t: Date.parse(h.date), e1rm: e1rm(h.exercises[exId].sets) }))
    .filter((p) => p.e1rm > 0);
}

/**
 * Deload suggestion: ~every 6 weeks of training, or when main lifts stall/drop for 2 sessions in a row
 * (no new best e1RM in their last 2 sessions). Snoozing or finishing a deload resets the clock.
 */
export function deloadCheck({ history = [], mainLiftIds = [], since = 0, now = Date.now(), weeks = 6 } = {}) {
  const hist = history.filter((h) => Date.parse(h.date) > since);
  if (hist.length < 4) return { suggest: false };
  const first = Date.parse(hist[0].date);
  if (now - first >= weeks * 7 * 864e5) return { suggest: true, reason: `${weeks}+ weeks of hard training since your last deload` };
  const stalled = [];
  let tracked = 0;
  for (const id of mainLiftIds) {
    const s = e1rmSeries(hist, id).map((p) => p.e1rm);
    if (s.length < 3) continue;
    tracked++;
    const [a, b, c] = s.slice(-3);
    if (b <= a && c <= a) stalled.push(id);
  }
  if (tracked && stalled.length >= Math.max(1, Math.ceil(tracked / 2))) return { suggest: true, reason: `main lifts stalled for 2 sessions`, stalled };
  return { suggest: false, stalled };
}

