// Training days / rest days. Pure helpers shared by every copy (Zane's root, Ben, Laychan, future friends).
// A schedule is a sorted array of weekday indexes, Monday = 0 … Sunday = 6, saved as S.profile.schedule.
// It only decides WHICH days are training days; the rotation (S.nextSession) is unchanged: the next session is always
// the next one in order, and a missed day simply moves it to the next training day (nothing is skipped).
import { MUSCLES } from "./program.js";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEK_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEK_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

/** Recommended training days per split (Mon = 0). */
export const DEFAULT_SCHEDULES = {
  3: [0, 2, 4],          // Mon, Wed, Fri: full body A / B / C with a rest day between each
  4: [0, 1, 3, 4],       // Mon, Tue, Thu, Fri: Upper A, Lower A, rest, Upper B, Lower B
  5: [0, 1, 3, 4, 5],    // Mon, Tue, Thu, Fri, Sat: Upper, Lower, rest, Push, Pull, Legs
  6: [0, 1, 2, 3, 4, 5], // Mon–Sat, rest Sunday
};
export const defaultSchedule = (days) => [...(DEFAULT_SCHEDULES[Number(days)] || DEFAULT_SCHEDULES[4])];

/** Sorted, de-duplicated weekday indexes 0–6 (anything else dropped). */
export function cleanSchedule(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}
/** {ok, count, need, message}: the number of training days has to match the split's day count. */
export function checkSchedule(list, days) {
  const s = cleanSchedule(list), need = Number(days), count = s.length;
  if (count === need) return { ok: true, count, need, message: "" };
  const d = (n) => `${n} day${n === 1 ? "" : "s"}`;
  return { ok: false, count, need, message: `Your plan is ${need} days a week: pick exactly ${d(need)} (you've picked ${d(count)}).` };
}
/** The saved schedule if it fits the plan, otherwise the recommended one (used by migrate and for old profiles). */
export function scheduleFor(profile) {
  const days = Number(profile?.days) || 4, s = cleanSchedule(profile?.schedule);
  return s.length === days ? s : defaultSchedule(days);
}
export const sameSchedule = (a, b) => cleanSchedule(a).join() === cleanSchedule(b).join();

/** Weekday index (Mon = 0) of a Date in local time. */
export const weekdayIndex = (date = new Date()) => (date.getDay() + 6) % 7;
export const isTrainingDay = (schedule, date = new Date()) => cleanSchedule(schedule).includes(weekdayIndex(date));

/** The next training day strictly after `from` (local dates): {date, weekday, inDays}. */
export function nextTrainingDay(schedule, from = new Date()) {
  const s = cleanSchedule(schedule); if (!s.length) return null;
  const w = weekdayIndex(from);
  for (let i = 1; i <= 7; i++) if (s.includes((w + i) % 7)) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return { date, weekday: (w + i) % 7, inDays: i };
  }
  return null;
}
/** "on Thursday" for the next training day. */
export const whenText = (next) => (!next ? "" : `on ${WEEKDAYS[next.weekday]}`);

// Abs are trained lightly on many days and recover quickly, so they don't count as "the same muscles".
const IGNORE = new Set(["abs"]);
const sessionMuscles = (s) => new Set((s?.exercises || []).map((e) => e.muscle).filter((m) => m && !IGNORE.has(m)));

/**
 * Back-to-back check (a gentle warning, never a block). In a normal week session i of the program lands on the i-th
 * training day, and the rotation wraps to session 0 the next Monday. For every pair of training days on consecutive
 * calendar days (including Sun → Mon), report the muscles both sessions train.
 * Returns [{from, to, fromName, toName, muscles:[keys], labels:[names]}], empty when there is nothing to warn about.
 */
export function backToBack(program, schedule) {
  const s = cleanSchedule(schedule), n = program?.length || 0;
  if (!n || s.length !== n || n < 2) return [];
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const j = (i + 1) % s.length, a = s[i], b = s[j];
    if ((a + 1) % 7 !== b) continue; // not consecutive calendar days
    const A = sessionMuscles(program[i]), B = sessionMuscles(program[j % n]);
    const shared = Object.keys(MUSCLES).filter((m) => A.has(m) && B.has(m));
    if (shared.length) out.push({ from: a, to: b, fromName: program[i].name, toName: program[j % n].name, muscles: shared, labels: shared.map((m) => MUSCLES[m]) });
  }
  return out;
}
/** One readable sentence for the Settings warning (or "" when the schedule has rest where it matters). */
export function backToBackText(pairs) {
  if (!pairs?.length) return "";
  const list = (xs) => xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
  const lines = pairs.map((p) => `${p.fromName} (${WEEK_SHORT[p.from]}) then ${p.toName} (${WEEK_SHORT[p.to]}) both train ${list(p.labels.map((l) => l.toLowerCase()))}`);
  return `Heads up: ${lines.join("; ")}, with no rest day between. A rest day between them gives those muscles time to recover. You can still save this.`;
}

/** Seven days Mon–Sun for the Today strip: {letter, name, train, today}. */
export function weekStrip(schedule, date = new Date()) {
  const s = cleanSchedule(schedule), w = weekdayIndex(date);
  return WEEK_LETTER.map((letter, i) => ({ letter, name: WEEKDAYS[i], train: s.includes(i), today: i === w }));
}
