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

/** Daily targets for a lean bulk. profile: {bodyweightKg, calorieGoal?, maintenanceKcal?, experience?} */
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
  const kcalFinal = goalGiven ? kcal : Math.max(kcal, round5(maintenance * 1.05));
  const proteinG = Math.round(kg * E.proteinDailyGPerKg);
  const fatG = Math.round(kg * E.fatDailyGPerKg);
  const carbFromKcal = Math.round((kcalFinal - proteinG * 4 - fatG * 9) / 4);
  const carbMinG = Math.round(kg * E.carbDailyMinGPerKg);
  return {
    kcal: kcalFinal, maintenance: Math.round(maintenance), maintenanceIsEstimate, goalGiven, surplus,
    proteinG, fatG, carbG: Math.max(carbFromKcal, carbMinG), carbMinG,
    carbBelowFloor: carbFromKcal < carbMinG,
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
export function autoregulate(weeklySets, perfChange, recovery) {
  const E = EVIDENCE;
  let delta = 0, reason = "hold";
  if (recovery === "poor" || (perfChange !== null && perfChange < -0.025)) { delta = -2; reason = "back off"; }
  else if (recovery === "good" && (perfChange === null || perfChange >= 0)) { delta = 1; reason = "add a set"; }
  return { weeklySets: clamp(weeklySets + delta, E.setsMin, E.setsMax), delta, reason };
}

/** Weekly weigh-in correction. Keeps the gain rate inside 0.25-0.5% bodyweight/week; never drops below maintenance. */
export function calorieAdjust(prevWeekAvgKg, thisWeekAvgKg, currentAdjust = 0) {
  const E = EVIDENCE;
  if (!(prevWeekAvgKg > 0 && thisWeekAvgKg > 0)) return { kcalAdjust: currentAdjust, change: 0, ratePct: null };
  const ratePct = ((thisWeekAvgKg - prevWeekAvgKg) / prevWeekAvgKg) * 100;
  let change = 0;
  if (ratePct < E.gainMinPctPerWeek) change = 150;
  else if (ratePct > E.gainMaxPctPerWeek) change = -100;
  return { kcalAdjust: currentAdjust + change, change, ratePct: +ratePct.toFixed(2) };
}

/** Planned sets per exercise this session: half the weekly sets for each muscle (2x/week), split across its exercises. */
export function plannedSets(session, weeklySetsByMuscle) {
  const byMuscle = {};
  for (const ex of session.exercises) (byMuscle[ex.muscle] ||= []).push(ex);
  const out = {};
  for (const [m, list] of Object.entries(byMuscle)) {
    let remaining = Math.ceil((weeklySetsByMuscle[m] ?? 12) / 2);
    list.forEach((ex, i) => {
      const n = Math.ceil(remaining / (list.length - i));
      out[ex.id] = Math.max(1, n); remaining -= n;
    });
  }
  return out;
}
