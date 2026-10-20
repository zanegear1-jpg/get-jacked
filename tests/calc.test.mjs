import test from "node:test";
import assert from "node:assert/strict";
import { postWorkout, dailyTargets, autoregulate, calorieAdjust, notificationText, e1rm, plannedSets } from "../calc.js";
import { SESSIONS, START_WEEKLY_SETS } from "../program.js";

test("post-workout protein is 0.55 g/kg (2.2/day over 4 meals), never under 0.4 g/kg", () => {
  const p = postWorkout(80, { hardSets: 20, durationMin: 60 });
  assert.equal(p.proteinG, 44); assert.equal(p.proteinMinG, 32);
  assert.ok(p.proteinG >= p.proteinMinG);
});
test("carbs scale 0.5 -> 1.0 g/kg with volume or duration, whichever is bigger", () => {
  assert.equal(postWorkout(80, { hardSets: 6, durationMin: 20 }).carbGPerKg, 0.5);
  assert.equal(postWorkout(80, { hardSets: 6, durationMin: 20 }).carbG, 40);
  assert.equal(postWorkout(80, { hardSets: 20, durationMin: 20 }).carbGPerKg, 0.75);
  assert.equal(postWorkout(80, { hardSets: 5, durationMin: 60 }).carbGPerKg, 0.75);
  assert.equal(postWorkout(80, { hardSets: 40, durationMin: 200 }).carbGPerKg, 1.0);
  assert.equal(postWorkout(80, { hardSets: 40, durationMin: 200 }).carbG, 80);
});
test("bodyweight is required", () => {
  assert.throws(() => postWorkout(undefined, { hardSets: 10, durationMin: 30 }));
  assert.throws(() => dailyTargets({}));
});
test("daily defaults are a lean bulk: +15% surplus, 2.2 g/kg protein", () => {
  const t = dailyTargets({ bodyweightKg: 80, maintenanceKcal: 2800 });
  assert.equal(t.kcal, 3220); assert.equal(t.proteinG, 176); assert.equal(t.fatG, 80);
  assert.equal(t.carbG, Math.round((3220 - 176 * 4 - 80 * 9) / 4));
  assert.deepEqual(t.weeklyGainKg, [0.2, 0.4]);
  assert.equal(dailyTargets({ bodyweightKg: 80, maintenanceKcal: 2800, experience: "advanced" }).kcal, 3010);
  assert.equal(dailyTargets({ bodyweightKg: 80, calorieGoal: 3500 }).kcal, 3500);
});
test("weigh-in adjust never takes the bulk below maintenance +5%", () => {
  const t = dailyTargets({ bodyweightKg: 80, maintenanceKcal: 2800, kcalAdjust: -2000 });
  assert.equal(t.kcal, 2940);
});
test("calorie adjust keeps gain at 0.25-0.5%/week", () => {
  assert.equal(calorieAdjust(80, 80.1).change, 150);   // 0.125% -> eat more
  assert.equal(calorieAdjust(80, 80.3).change, 0);     // 0.375% -> on target
  assert.equal(calorieAdjust(80, 80.6).change, -100);  // 0.75% -> trim
  assert.equal(calorieAdjust(0, 80).ratePct, null);
});
test("autoregulation: +1 set when recovering well, -2 when performance drops, 10-20 cap", () => {
  assert.deepEqual(autoregulate(14, 0.02, "good"), { weeklySets: 15, delta: 1, reason: "add a set" });
  assert.equal(autoregulate(14, null, "good").weeklySets, 15);
  assert.equal(autoregulate(14, -0.05, "good").weeklySets, 12);
  assert.equal(autoregulate(14, 0.05, "poor").weeklySets, 12);
  assert.equal(autoregulate(14, 0.01, "ok").weeklySets, 14);
  assert.equal(autoregulate(20, 0.1, "good").weeklySets, 20);
  assert.equal(autoregulate(10, -0.1, "poor").weeklySets, 10);
});
test("notification text carries the numbers", () => {
  const n = notificationText(postWorkout(80, { hardSets: 24, durationMin: 75 }));
  assert.match(n.title, /44 g protein \+ 70 g carbs/);
});
test("e1rm and planned sets", () => {
  assert.equal(e1rm([{ weight: 100, reps: 6, done: true }, { weight: 120, reps: 1, done: false }]), 120);
  const plan = plannedSets(SESSIONS[0], START_WEEKLY_SETS);
  assert.equal(plan.bench + plan.inclinedb, 7); // chest 14/wk -> 7 this session
  for (const s of SESSIONS) for (const e of s.exercises) assert.ok(plan[e.id] === undefined || plan[e.id] >= 1);
});
