// Pure helpers for the one-exercise-per-screen workout. No DOM, so they're unit-tested.
/** Clamp a saved position to the current exercise list. */
export const clampIndex = (i, n) => (n ? Math.min(n - 1, Math.max(0, Number.isInteger(+i) ? +i : 0)) : 0);
/** "done" (every set ticked), "partial" (some), or "todo". */
export function exerciseStatus(sets = []) {
  const d = sets.filter((s) => s.done).length;
  return !sets.length || !d ? "todo" : d === sets.length ? "done" : "partial";
}
/** A horizontal swipe: -1 = next (finger moves left), +1 = back, 0 = not a swipe. */
export function swipeDir(dx, dy, min = 60) {
  if (Math.abs(dx) < min || Math.abs(dy) > Math.abs(dx) * 0.6) return 0;
  return dx < 0 ? -1 : 1;
}
/** "Exercise 3 of 8" */
export const positionLabel = (i, n) => `Exercise ${i + 1} of ${n}`;
