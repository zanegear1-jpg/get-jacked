// 4-day upper/lower split: every muscle trained twice a week (Baz-Valle 2022 volume ranges were
// for ~2x/week frequency). Compound lifts first, then isolation work that loads the muscle hard
// through a full range. Rep ranges: compounds 6-10, isolations 10-15, ~1-2 reps in reserve.
export const MUSCLES = {
  chest: "Chest", back: "Back", quads: "Quads", hamstrings: "Hamstrings",
  delts: "Side delts", biceps: "Biceps", triceps: "Triceps", calves: "Calves",
};
// Starting weekly sets: big muscles high in the 12-20 range; arms/delts/calves lower because
// pressing and pulling already hit them. Auto-regulation moves each one between 10 and 20.
export const START_WEEKLY_SETS = {
  chest: 14, back: 14, quads: 14, hamstrings: 12, delts: 12, biceps: 10, triceps: 10, calves: 10,
};
const ex = (id, name, muscle, reps, step) => ({ id, name, muscle, reps, step });
export const SESSIONS = [
  { id: "upperA", name: "Upper A", exercises: [
    ex("bench", "Barbell bench press", "chest", [6, 10], 2.5),
    ex("csrow", "Chest-supported row", "back", [8, 12], 2.5),
    ex("inclinedb", "Incline dumbbell press", "chest", [8, 12], 2),
    ex("pulldown", "Lat pulldown", "back", [8, 12], 2.5),
    ex("latraise", "Dumbbell lateral raise", "delts", [12, 20], 1),
    ex("ohtri", "Overhead cable triceps extension", "triceps", [10, 15], 2.5),
    ex("inclinecurl", "Incline dumbbell curl", "biceps", [10, 15], 1),
  ]},
  { id: "lowerA", name: "Lower A", exercises: [
    ex("squat", "Back squat", "quads", [6, 10], 2.5),
    ex("rdl", "Romanian deadlift", "hamstrings", [6, 10], 2.5),
    ex("legpress", "Leg press", "quads", [10, 15], 5),
    ex("seatedcurl", "Seated leg curl", "hamstrings", [10, 15], 2.5),
    ex("standcalf", "Standing calf raise", "calves", [10, 15], 2.5),
  ]},
  { id: "upperB", name: "Upper B", exercises: [
    ex("pullup", "Weighted pull-up", "back", [6, 10], 2.5),
    ex("machpress", "Machine chest press", "chest", [8, 12], 2.5),
    ex("cablerow", "Seated cable row", "back", [8, 12], 2.5),
    ex("dip", "Weighted dip", "chest", [8, 12], 2.5),
    ex("cablelat", "Cable lateral raise", "delts", [12, 20], 1),
    ex("skull", "EZ-bar skull crusher", "triceps", [10, 15], 2.5),
    ex("cablecurl", "Cable curl", "biceps", [10, 15], 2.5),
  ]},
  { id: "lowerB", name: "Lower B", exercises: [
    ex("hack", "Hack squat", "quads", [8, 12], 5),
    ex("lyingcurl", "Lying leg curl", "hamstrings", [10, 15], 2.5),
    ex("bss", "Bulgarian split squat", "quads", [8, 12], 2),
    ex("sldl", "Stiff-leg deadlift", "hamstrings", [8, 12], 2.5),
    ex("seatcalf", "Seated calf raise", "calves", [12, 20], 2.5),
  ]},
];
