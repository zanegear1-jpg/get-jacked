// Training days / rest days: recommended defaults per split, custom days, the back-to-back warning, next training day,
// the week strip, and migration of saved profiles that have no schedule yet.
import test from "node:test";
import assert from "node:assert/strict";
import { buildProgram, DAYS } from "../program.js";
import { DEFAULT_SCHEDULES, defaultSchedule, cleanSchedule, checkSchedule, scheduleFor, isTrainingDay, nextTrainingDay, whenText, backToBack, backToBackText, weekStrip, weekdayIndex } from "../schedule.js";
import { migrate, fresh } from "../state.js";

const prog = (days) => buildProgram({ days, equipment: "full", experience: "intermediate" });
const at = (y, m, d) => new Date(y, m - 1, d, 9, 0); // local 9am
const WED = at(2026, 10, 28);

test("recommended training days per split", () => {
  assert.deepEqual(defaultSchedule(3), [0, 2, 4]);          // Mon, Wed, Fri
  assert.deepEqual(defaultSchedule(4), [0, 1, 3, 4]);       // Mon, Tue, Thu, Fri
  assert.deepEqual(defaultSchedule(5), [0, 1, 3, 4, 5]);    // Mon, Tue, Thu, Fri, Sat
  assert.deepEqual(defaultSchedule(6), [0, 1, 2, 3, 4, 5]); // Mon–Sat, rest Sunday
  for (const d of DAYS) {
    assert.equal(defaultSchedule(d).length, d); assert.ok(checkSchedule(defaultSchedule(d), d).ok);
    assert.deepEqual(backToBack(prog(d), defaultSchedule(d)), [], `${d}-day default has no back-to-back warning`);
  }
  assert.notEqual(defaultSchedule(4), DEFAULT_SCHEDULES[4], "a copy, so callers can't change the defaults");
  assert.deepEqual(defaultSchedule(9), [0, 1, 3, 4], "unknown split falls back to 4 days");
});

test("custom training days: cleaned, count must match the split", () => {
  assert.deepEqual(cleanSchedule([4, 0, 4, "2", 9, -1, 1.5, null]), [0, 2, 4]);
  assert.deepEqual(cleanSchedule("Mon"), []);
  assert.deepEqual(checkSchedule([0, 2, 3, 4], 4), { ok: true, count: 4, need: 4, message: "" });
  const c = checkSchedule([0, 2, 4], 4);
  assert.equal(c.ok, false); assert.equal(c.message, "Your plan is 4 days a week: pick exactly 4 days (you've picked 3 days).");
  assert.match(checkSchedule([0], 3).message, /you've picked 1 day\)/);
  assert.deepEqual(scheduleFor({ days: 4, schedule: [6, 5, 3, 2] }), [2, 3, 5, 6], "a valid custom pick is kept");
  assert.deepEqual(scheduleFor({ days: 4, schedule: [0, 1, 2] }), [0, 1, 3, 4], "wrong count -> recommended");
  assert.deepEqual(scheduleFor({ days: 3 }), [0, 2, 4]);
  assert.deepEqual(scheduleFor(null), [0, 1, 3, 4]);
});

test("back-to-back warning comes from the program's real muscle overlap", () => {
  // 3-day full body on Mon + Tue: both sessions train the big muscles
  const w = backToBack(prog(3), [0, 1, 4]);
  assert.equal(w.length, 1); assert.equal(w[0].fromName, "Full body A"); assert.equal(w[0].toName, "Full body B");
  assert.equal(w[0].from, 0); assert.equal(w[0].to, 1);
  for (const m of ["chest", "back", "quads", "hamstrings"]) assert.ok(w[0].muscles.includes(m), m);
  assert.ok(!w[0].muscles.includes("abs"), "abs alone never count");
  assert.match(backToBackText(w), /^Heads up: Full body A \(Mon\) then Full body B \(Tue\) both train chest, back, quads, hamstrings, side delts and calves, with no rest day between\..*You can still save this\.$/);
  // Sun -> Mon wraps: Full body C on Sunday, Full body A on Monday
  const wrap = backToBack(prog(3), [0, 3, 6]);
  assert.equal(wrap.length, 1); assert.equal(wrap[0].fromName, "Full body C"); assert.equal(wrap[0].to, 0);
  // three in a row: two warnings
  assert.equal(backToBack(prog(3), [0, 1, 2]).length, 2);
  // upper/lower and push/pull/legs alternate muscles, so consecutive days are fine (Lower A + Upper B share only abs)
  assert.deepEqual(backToBack(prog(4), [0, 1, 2, 3]), []);
  assert.deepEqual(backToBack(prog(5), [0, 1, 2, 3, 4]), []);
  assert.deepEqual(backToBack(prog(6), [1, 2, 3, 4, 5, 6]), []);
  // two lower-body sessions back to back (a custom program order) are flagged
  const lowers = [{ name: "Lower A", exercises: [{ muscle: "quads" }, { muscle: "hamstrings" }, { muscle: "abs" }] },
    { name: "Lower B", exercises: [{ muscle: "quads" }, { muscle: "glutes" }] }];
  const lw = backToBack(lowers, [3, 4]);
  assert.equal(lw.length, 1); assert.deepEqual(lw[0].labels, ["Quads"]);
  assert.match(backToBackText(lw), /Lower A \(Thu\) then Lower B \(Fri\) both train quads/);
  assert.equal(backToBackText([]), "");
  assert.deepEqual(backToBack(prog(4), [0, 1]), [], "a mismatched pick is reported by checkSchedule, not here");
});

test("rest days, next training day and the week strip", () => {
  const s4 = defaultSchedule(4);
  assert.equal(weekdayIndex(at(2026, 10, 26)), 0, "Monday = 0"); assert.equal(weekdayIndex(at(2026, 10, 25)), 6, "Sunday = 6");
  assert.equal(isTrainingDay(s4, WED), false); assert.equal(isTrainingDay(s4, at(2026, 10, 29)), true);
  const n = nextTrainingDay(s4, WED);
  assert.equal(n.weekday, 3); assert.equal(n.inDays, 1); assert.equal(n.date.getDate(), 29); assert.equal(whenText(n), "on Thursday");
  assert.deepEqual([nextTrainingDay(s4, at(2026, 10, 30)).weekday, nextTrainingDay(s4, at(2026, 10, 30)).inDays], [0, 3], "Fri -> Mon");
  assert.equal(nextTrainingDay(s4, at(2026, 10, 25)).date.getMonth(), 9, "Sun 25 Oct -> Mon 26 Oct");
  assert.equal(whenText(nextTrainingDay([6], at(2026, 10, 25))), "on Sunday", "only-day-of-week -> a week later");
  assert.equal(nextTrainingDay([], WED), null);
  const strip = weekStrip(s4, WED);
  assert.deepEqual(strip.map((d) => d.letter).join(""), "MTWTFSS");
  assert.deepEqual(strip.map((d) => +d.train).join(""), "1101100"); assert.deepEqual(strip.map((d) => +d.today).join(""), "0010000");
});

test("migration: a saved profile with no schedule gets the recommended one, nothing else changes", () => {
  const profile = { bodyweightKg: 92.5, days: 5, equipment: "home", experience: "advanced", maintenanceKcal: 3100, calorieGoal: null };
  const raw = { ...fresh(), profile: { ...profile }, nextSession: 3, history: [{ date: "2026-10-20T07:00:00.000Z", name: "Push", exercises: { bench: { sets: [] } } }], weighIns: [{ date: "2026-10-20", kg: 92.5 }] };
  const S = migrate(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(S.profile, { ...profile, schedule: [0, 1, 3, 4, 5] });
  assert.equal(S.nextSession, 3); assert.deepEqual(S.history, raw.history); assert.deepEqual(S.weighIns, raw.weighIns);
  // v1 profile without days -> 4 days -> Mon, Tue, Thu, Fri
  assert.deepEqual(migrate({ profile: { bodyweightKg: 80 } }).profile.schedule, [0, 1, 3, 4]);
  // a saved custom schedule is kept; a broken one (wrong count / junk) is replaced
  assert.deepEqual(migrate({ profile: { ...profile, schedule: [6, 0, 2, 3, 5] } }).profile.schedule, [0, 2, 3, 5, 6]);
  assert.deepEqual(migrate({ profile: { ...profile, schedule: [0, 1] } }).profile.schedule, [0, 1, 3, 4, 5]);
  assert.deepEqual(migrate({ profile: { ...profile, schedule: "weekdays" } }).profile.schedule, [0, 1, 3, 4, 5]);
  assert.equal(migrate({ profile: null }).profile, null, "no profile yet (onboarding) stays null");
  // migrating twice is stable (backup -> restore -> reload)
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(S))), S);
});

test("rest-day week strip side is a theme setting: falcon opts into the right, everything else (and new themes) is left", async () => {
  const { loadTheme, friendFiles, rootFiles } = await import("../scripts/build-friends.mjs");
  assert.equal(loadTheme("falcon").restStrip, "right"); assert.ok(loadTheme("falcon").classes.includes("rest-strip-right"));
  for (const t of ["jacked", "hilux"]) {
    assert.equal(loadTheme(t).restStrip, "left", `${t} doesn't inherit falcon's right side`);
    assert.ok(!loadTheme(t).classes.includes("rest-strip-right") && loadTheme(t).classes.includes("theme-falcon"));
  }
  const fs = await import("node:fs");
  assert.match(fs.readFileSync(new URL("../laychan/index.html", import.meta.url), "utf8"), /<body class="[^"]*\brest-strip-right\b/);
  for (const f of ["../index.html", "../ben/index.html"]) assert.doesNotMatch(fs.readFileSync(new URL(f, import.meta.url), "utf8"), /rest-strip-right/);
});
