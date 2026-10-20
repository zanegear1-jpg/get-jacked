// Saved-state shape + migration. Storage key stays "massplan.v1" so nobody loses data; `schema` tracks the shape.
import { LIBRARY, START_WEEKLY_SETS, MUSCLES } from "./program.js";

export const SCHEMA = 2;
export function fresh() {
  return { schema: SCHEMA, profile: null, weeklySets: { ...START_WEEKLY_SETS }, nextSession: 0, history: [], weighIns: [],
    kcalAdjust: 0, lastKcalAdjustAt: 0, active: null, lastSummary: null,
    swaps: {}, volAdjWeek: {}, deload: null, deloadSince: 0, deloadSnoozeUntil: 0 };
}

const OLD_NAMES = { upperA: "Upper A", lowerA: "Lower A", upperB: "Upper B", lowerB: "Lower B" };
const OLD_IDS = ["upperA", "lowerA", "upperB", "lowerB"];

/** Bring any saved state (v1 or newer, or an imported backup) up to the current schema. Returns null if unusable. */
export function migrate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const S = { ...fresh(), ...raw };
  if (!Array.isArray(S.history)) S.history = [];
  if (!Array.isArray(S.weighIns)) S.weighIns = [];
  S.weeklySets = { ...START_WEEKLY_SETS, ...(raw.weeklySets || {}) };
  for (const m of Object.keys(S.weeklySets)) if (!(m in MUSCLES)) delete S.weeklySets[m];
  S.swaps ||= {}; S.volAdjWeek ||= {};
  if (S.profile) S.profile = { days: 4, equipment: "full", experience: "intermediate", ...S.profile };
  // v1 history: add a session name.
  S.history = S.history.filter((h) => h && h.exercises).map((h) => ({ ...h, name: h.name || OLD_NAMES[h.session] || h.session }));
  // v1 active workout: no session snapshot. Rebuild it from the exercise ids it holds.
  if (S.active && !S.active.session) {
    const ids = Object.keys(S.active.exercises || {}).filter((id) => LIBRARY[id]);
    const sid = OLD_IDS[(S.active.sessionIdx || 0) % 4];
    S.active.session = { id: sid, name: OLD_NAMES[sid], exercises: ids.map((id) => ({ ...LIBRARY[id] })) };
  }
  if (S.active) for (const x of Object.values(S.active.exercises || {})) for (const st of x.sets || []) { if (!("rir" in st)) st.rir = ""; }
  S.schema = SCHEMA;
  return S;
}
