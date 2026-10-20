// Get Jacked programs. Every major muscle is trained ~2x/week (3x on 3-day full body) at 10-20 hard
// sets/week (Schoenfeld 2017; Baz-Valle 2022 ranges were for ~2x/week). Compounds first, then isolations
// through a full range. Rep ranges: heavy compounds 6-10, others 8-12, isolations 10-20, ~1-2 RIR.

// range = weekly hard-set range the auto-regulation keeps each muscle in.
// Glutes, rear delts and abs already get a lot of indirect work from squats/hinges, rows and compounds,
// so their *direct* work runs 6-12 sets (Get Jacked rule of thumb).
export const MUSCLES = {
  chest: "Chest", back: "Back", quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes",
  delts: "Side delts", reardelts: "Rear delts", biceps: "Biceps", triceps: "Triceps", calves: "Calves", abs: "Abs",
};
export const MAJOR = ["chest", "back", "quads", "hamstrings", "delts", "biceps", "triceps", "calves"];
export const SET_RANGE = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, MAJOR.includes(m) ? [10, 20] : [6, 12]]));

export const START_WEEKLY_SETS = {
  chest: 14, back: 14, quads: 14, hamstrings: 12, glutes: 8, delts: 12, reardelts: 8,
  biceps: 10, triceps: 10, calves: 10, abs: 8,
};
/** Starting volume: novices and 3-day lifters start at the bottom of the range (long full-body sessions). */
export function startWeeklySets({ experience, days } = {}) {
  if (experience === "novice" || Number(days) === 3) return Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, SET_RANGE[m][0]]));
  return { ...START_WEEKLY_SETS };
}

export const EQUIPMENT = {
  full: { label: "Full gym", tags: ["g", "d", "b", "n"] },
  dumbbells: { label: "Dumbbells + bench only", tags: ["d", "b"] },
  home: { label: "Home: bodyweight + bands", tags: ["b", "n"] },
};
export const DAYS = [3, 4, 5, 6];

// kind: C = compound (longer rest), I = isolation. eq: g gym (barbell/machine/cable), d dumbbell, b bodyweight, n band.
// step: load jump (kg) once every set hits the top of the rep range; 0 = progress reps, then a harder variation.
// easy: swap used for novices.
const X = (id, name, muscle, reps, step, kind, eq, extra = {}) => ({ id, name, muscle, reps, step, kind, eq, ...extra });
export const LIBRARY = Object.fromEntries([
  // chest
  X("bench", "Barbell bench press", "chest", [6, 10], 2.5, "C", "g"),
  X("machpress", "Machine chest press", "chest", [8, 12], 2.5, "C", "g"),
  X("dip", "Weighted dip", "chest", [6, 10], 2.5, "C", "g", { easy: "assistdip" }),
  X("assistdip", "Assisted dip (machine)", "chest", [8, 12], 2.5, "C", "g"),
  X("cablefly", "Cable fly", "chest", [10, 15], 2.5, "I", "g"),
  X("dbbench", "Dumbbell bench press", "chest", [6, 10], 2, "C", "d"),
  X("inclinedb", "Incline dumbbell press", "chest", [8, 12], 2, "C", "d"),
  X("dbfly", "Dumbbell fly", "chest", [10, 15], 2, "I", "d"),
  X("pushup", "Push-up (add a backpack when easy)", "chest", [8, 20], 0, "C", "b"),
  X("deficitpushup", "Deficit push-up", "chest", [8, 20], 0, "C", "b"),
  X("bandpress", "Band chest press", "chest", [12, 20], 0, "C", "n"),
  X("bandfly", "Band chest fly", "chest", [12, 20], 0, "I", "n"),
  // back
  X("pullup", "Weighted pull-up", "back", [6, 10], 2.5, "C", "g", { easy: "pulldown" }),
  X("pulldown", "Lat pulldown", "back", [8, 12], 2.5, "C", "g"),
  X("csrow", "Chest-supported row", "back", [8, 12], 2.5, "C", "g"),
  X("cablerow", "Seated cable row", "back", [8, 12], 2.5, "C", "g"),
  X("dbrow", "One-arm dumbbell row", "back", [8, 12], 2, "C", "d"),
  X("dbpullover", "Dumbbell pullover", "back", [10, 15], 2, "I", "d"),
  X("bwpullup", "Pull-up (doorway bar; band-assisted if needed)", "back", [5, 12], 0, "C", "b", { easy: "invrow" }),
  X("invrow", "Inverted row (sturdy table or bar)", "back", [8, 15], 0, "C", "b"),
  X("bandrow", "Band row", "back", [12, 20], 0, "C", "n"),
  X("bandpulldown", "Band lat pulldown", "back", [12, 20], 0, "C", "n"),
  // quads
  X("squat", "Back squat", "quads", [6, 10], 2.5, "C", "g"),
  X("hack", "Hack squat", "quads", [8, 12], 5, "C", "g"),
  X("legpress", "Leg press", "quads", [10, 15], 5, "C", "g"),
  X("legext", "Leg extension", "quads", [10, 15], 2.5, "I", "g"),
  X("gobletsq", "Goblet squat", "quads", [8, 12], 2, "C", "d"),
  X("bss", "Bulgarian split squat", "quads", [8, 12], 2, "C", "d"),
  X("dblunge", "Dumbbell walking lunge", "quads", [8, 12], 2, "C", "d"),
  X("bwsplit", "Bodyweight Bulgarian split squat", "quads", [10, 20], 0, "C", "b"),
  X("stepup", "Step-up (high step)", "quads", [10, 20], 0, "C", "b"),
  X("sissy", "Sissy squat (hold support)", "quads", [8, 15], 0, "I", "b"),
  X("bandsquat", "Band front squat", "quads", [12, 20], 0, "C", "n"),
  // hamstrings
  X("rdl", "Romanian deadlift", "hamstrings", [6, 10], 2.5, "C", "g"),
  X("sldl", "Stiff-leg deadlift", "hamstrings", [8, 12], 2.5, "C", "g"),
  X("seatedcurl", "Seated leg curl", "hamstrings", [10, 15], 2.5, "I", "g"),
  X("lyingcurl", "Lying leg curl", "hamstrings", [10, 15], 2.5, "I", "g"),
  X("dbrdl", "Dumbbell Romanian deadlift", "hamstrings", [8, 12], 2, "C", "d"),
  X("slrdl", "Single-leg dumbbell RDL", "hamstrings", [8, 12], 2, "C", "d"),
  X("dbcurl", "Dumbbell leg curl (lying)", "hamstrings", [10, 15], 2, "I", "d"),
  X("nordic", "Nordic curl (assisted)", "hamstrings", [4, 10], 0, "I", "b"),
  X("slidercurl", "Slider leg curl", "hamstrings", [8, 15], 0, "I", "b"),
  X("bandcurl", "Band leg curl", "hamstrings", [12, 20], 0, "I", "n"),
  X("bandgm", "Band good morning", "hamstrings", [12, 20], 0, "C", "n"),
  // glutes
  X("hipthrust", "Barbell hip thrust", "glutes", [8, 12], 5, "C", "g"),
  X("cablekick", "Cable glute kickback", "glutes", [12, 20], 2.5, "I", "g"),
  X("dbhipthrust", "Dumbbell hip thrust", "glutes", [10, 15], 2, "C", "d"),
  X("slhipthrust", "Single-leg hip thrust", "glutes", [10, 20], 0, "C", "b"),
  X("bandabd", "Banded hip abduction", "glutes", [15, 25], 0, "I", "n"),
  // side delts
  X("latraise", "Dumbbell lateral raise", "delts", [12, 20], 2, "I", "d"),
  X("cablelat", "Cable lateral raise", "delts", [12, 20], 2.5, "I", "g"),
  X("machlat", "Machine lateral raise", "delts", [12, 20], 2.5, "I", "g"),
  X("leanlat", "Lean-away dumbbell lateral raise", "delts", [12, 20], 2, "I", "d"),
  X("bandlat", "Band lateral raise", "delts", [15, 25], 0, "I", "n"),
  // rear delts
  X("facepull", "Face pull", "reardelts", [12, 20], 2.5, "I", "g"),
  X("revfly", "Reverse pec-deck", "reardelts", [12, 20], 2.5, "I", "g"),
  X("dbrearfly", "Bent-over dumbbell rear-delt fly", "reardelts", [12, 20], 2, "I", "d"),
  X("ytraise", "Prone Y-T raise", "reardelts", [12, 20], 0, "I", "b"),
  X("pullapart", "Band pull-apart", "reardelts", [15, 25], 0, "I", "n"),
  // biceps
  X("inclinecurl", "Incline dumbbell curl", "biceps", [10, 15], 2, "I", "d"),
  X("hammer", "Dumbbell hammer curl", "biceps", [10, 15], 2, "I", "d"),
  X("cablecurl", "Cable curl", "biceps", [10, 15], 2.5, "I", "g"),
  X("ezcurl", "EZ-bar curl", "biceps", [8, 12], 2.5, "I", "g"),
  X("bandbicurl", "Band curl", "biceps", [12, 20], 0, "I", "n"),
  // triceps
  X("ohtri", "Overhead cable triceps extension", "triceps", [10, 15], 2.5, "I", "g"),
  X("skull", "EZ-bar skull crusher", "triceps", [10, 15], 2.5, "I", "g"),
  X("pushdown", "Cable pushdown", "triceps", [10, 15], 2.5, "I", "g"),
  X("dbohtri", "Overhead dumbbell triceps extension", "triceps", [10, 15], 2, "I", "d"),
  X("dbskull", "Dumbbell skull crusher", "triceps", [10, 15], 2, "I", "d"),
  X("diamond", "Close-grip push-up", "triceps", [8, 20], 0, "I", "b"),
  X("bandpushdown", "Band pushdown", "triceps", [15, 25], 0, "I", "n"),
  // calves
  X("standcalf", "Standing calf raise", "calves", [10, 15], 2.5, "I", "g"),
  X("seatcalf", "Seated calf raise", "calves", [12, 20], 2.5, "I", "g"),
  X("dbcalf", "Single-leg dumbbell calf raise", "calves", [10, 15], 2, "I", "d"),
  X("bwcalf", "Single-leg calf raise (on a step)", "calves", [12, 25], 0, "I", "b"),
  // abs
  X("cablecrunch", "Cable crunch", "abs", [10, 15], 2.5, "I", "g"),
  X("hlr", "Hanging leg raise", "abs", [8, 15], 0, "I", "g"),
  X("dbcrunch", "Weighted crunch (dumbbell)", "abs", [10, 15], 2, "I", "d"),
  X("revcrunch", "Reverse crunch", "abs", [10, 20], 0, "I", "b"),
  X("crunch", "Crunch (slow, full range)", "abs", [12, 25], 0, "I", "b"),
].map((e) => [e.id, e]));

// Slot -> exercise per equipment [full, dumbbells, home].
const SLOTS = {
  chestA1: ["bench", "dbbench", "pushup"], chestA2: ["inclinedb", "dbfly", "bandfly"],
  chestB1: ["machpress", "inclinedb", "deficitpushup"], chestB2: ["dip", "pushup", "bandpress"],
  backA1: ["pullup", "dbrow", "bwpullup"], backA2: ["csrow", "dbpullover", "bandrow"],
  backB1: ["cablerow", "bwpullup", "invrow"], backB2: ["pulldown", "dbrow", "bandpulldown"],
  quadsA1: ["squat", "gobletsq", "bwsplit"], quadsA2: ["legpress", "bss", "sissy"],
  quadsB1: ["hack", "dblunge", "stepup"], quadsB2: ["legext", "gobletsq", "bandsquat"],
  hamsA1: ["rdl", "dbrdl", "bandgm"], hamsA2: ["seatedcurl", "dbcurl", "slidercurl"],
  hamsB1: ["sldl", "slrdl", "nordic"], hamsB2: ["lyingcurl", "dbcurl", "bandcurl"],
  glutesA: ["hipthrust", "dbhipthrust", "slhipthrust"], glutesB: ["cablekick", "slhipthrust", "bandabd"],
  deltsA: ["latraise", "latraise", "bandlat"], deltsB: ["cablelat", "leanlat", "bandlat"],
  rearA: ["facepull", "dbrearfly", "pullapart"], rearB: ["revfly", "dbrearfly", "ytraise"],
  bisA: ["inclinecurl", "inclinecurl", "bandbicurl"], bisB: ["cablecurl", "hammer", "bandbicurl"],
  trisA: ["ohtri", "dbohtri", "diamond"], trisB: ["skull", "dbskull", "bandpushdown"],
  calvesA: ["standcalf", "dbcalf", "bwcalf"], calvesB: ["seatcalf", "dbcalf", "bwcalf"],
  absA: ["cablecrunch", "dbcrunch", "revcrunch"], absB: ["hlr", "revcrunch", "crunch"],
};

const T = (id, name, slots) => ({ id, name, slots });
export const TEMPLATES = {
  3: [
    T("fbA", "Full body A", ["chestA1", "backA1", "quadsA1", "hamsA2", "deltsA", "trisA", "calvesA", "absA"]),
    T("fbB", "Full body B", ["quadsB1", "backB1", "chestB1", "hamsA1", "glutesA", "deltsB", "rearA", "bisB", "calvesB"]),
    T("fbC", "Full body C", ["backB2", "hamsB1", "chestA2", "quadsA2", "deltsA", "rearB", "trisB", "bisA", "glutesB", "absB"]),
  ],
  4: [
    T("upperA", "Upper A", ["chestA1", "backA2", "chestA2", "backB2", "deltsA", "rearA", "trisA", "bisA"]),
    T("lowerA", "Lower A", ["quadsA1", "hamsA1", "quadsA2", "hamsA2", "glutesA", "calvesA", "absA"]),
    T("upperB", "Upper B", ["backA1", "chestB1", "backB1", "chestB2", "deltsB", "rearB", "trisB", "bisB"]),
    T("lowerB", "Lower B", ["quadsB1", "hamsB2", "quadsB2", "hamsB1", "glutesB", "calvesB", "absB"]),
  ],
  5: [
    T("upper", "Upper", ["chestA1", "backA2", "chestA2", "backB2", "deltsA", "rearA", "trisA", "bisA"]),
    T("lower", "Lower", ["quadsA1", "hamsA1", "quadsA2", "hamsA2", "glutesB", "calvesA", "absA"]),
    T("push", "Push", ["chestB1", "chestB2", "deltsB", "trisB"]),
    T("pull", "Pull", ["backA1", "backB1", "rearB", "bisB", "absB"]),
    T("legs", "Legs", ["quadsB1", "hamsB1", "quadsB2", "hamsB2", "glutesA", "calvesB"]),
  ],
  6: [
    T("pushA", "Push A", ["chestA1", "chestA2", "deltsA", "trisA"]),
    T("pullA", "Pull A", ["backA1", "backA2", "rearA", "bisA"]),
    T("legsA", "Legs A", ["quadsA1", "hamsA1", "quadsA2", "hamsA2", "glutesA", "calvesA", "absA"]),
    T("pushB", "Push B", ["chestB1", "chestB2", "deltsB", "trisB", "absB"]),
    T("pullB", "Pull B", ["backB1", "backB2", "rearB", "bisB"]),
    T("legsB", "Legs B", ["quadsB1", "hamsB2", "quadsB2", "hamsB1", "glutesB", "calvesB"]),
  ],
};

const EQ_IDX = { full: 0, dumbbells: 1, home: 2 };
export const allowed = (ex, equipment = "full") => EQUIPMENT[equipment]?.tags.includes(ex.eq) ?? true;
/** Alternatives for a swap: same muscle, usable with this equipment, not already in the session. */
export function alternatives(exId, equipment = "full", exclude = []) {
  const ex = LIBRARY[exId];
  if (!ex) return [];
  return Object.values(LIBRARY).filter((e) => e.muscle === ex.muscle && e.id !== exId && allowed(e, equipment) && !exclude.includes(e.id));
}

/**
 * Build the program. opts: {days 3-6, equipment full|dumbbells|home, experience, swaps {slot: exId}}.
 * Returns [{id, name, exercises: [{...exercise, slot}]}]. No exercise repeats inside a session.
 */
export function buildProgram({ days = 4, equipment = "full", experience = "intermediate", swaps = {} } = {}) {
  const tpl = TEMPLATES[days] || TEMPLATES[4];
  const ei = EQ_IDX[equipment] ?? 0;
  return tpl.map((t) => {
    const used = [];
    const exercises = t.slots.map((slot) => {
      let id = swaps[`${t.id}:${slot}`] || swaps[slot];
      if (!id || !LIBRARY[id] || !allowed(LIBRARY[id], equipment)) {
        id = SLOTS[slot][ei];
        if (experience === "novice" && LIBRARY[id].easy) id = LIBRARY[id].easy;
      }
      if (used.includes(id)) id = (alternatives(id, equipment, used)[0] || LIBRARY[id]).id;
      used.push(id);
      return { ...LIBRARY[id], slot };
    });
    return { id: t.id, name: t.name, exercises };
  });
}

/** How many sessions in the program train each muscle (to split the weekly sets). */
export function muscleFrequency(program) {
  const f = {};
  for (const s of program) for (const m of new Set(s.exercises.map((e) => e.muscle))) f[m] = (f[m] || 0) + 1;
  return f;
}

/** For session idx: which occurrence (0-based) of each muscle in the week it is. */
export function muscleOrdinal(program, idx) {
  const seen = {}, out = {};
  program.forEach((s, i) => { for (const m of new Set(s.exercises.map((e) => e.muscle))) { if (i === idx) out[m] = seen[m] || 0; seen[m] = (seen[m] || 0) + 1; } });
  return out;
}

// Back-compat: the original fixed 4-day full-gym program.
export const SESSIONS = buildProgram({ days: 4, equipment: "full" });
