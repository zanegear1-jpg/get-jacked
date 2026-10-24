import test from "node:test";
import assert from "node:assert/strict";
import { buildProgram, muscleFrequency, muscleOrdinal, alternatives, allowed, startWeeklySets, MUSCLES, MAJOR, SET_RANGE, LIBRARY, START_WEEKLY_SETS } from "../program.js";
import { plannedSets, progression, progressStatus, startingWeight, restSeconds, dailyTargets, autoregulate, weekStart, weeklyDone, deloadCheck, e1rmSeries } from "../calc.js";
import { migrate, fresh, SCHEMA } from "../state.js";

const COMBOS = [];
for (const days of [3, 4, 5, 6]) for (const equipment of ["full", "dumbbells", "home"]) for (const experience of ["novice", "intermediate", "advanced"]) COMBOS.push({ days, equipment, experience });

test("every days/equipment/experience combo trains every muscle >=2x/week with 10-20 weekly sets (6-12 direct for minor)", () => {
  for (const c of COMBOS) {
    const prog = buildProgram(c), f = muscleFrequency(prog), tag = JSON.stringify(c);
    assert.equal(prog.length, c.days, tag);
    const weekly = startWeeklySets(c), total = {};
    for (const [i, s] of prog.entries()) {
      const ids = s.exercises.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, `no repeats in ${s.name} ${tag}`);
      for (const e of s.exercises) assert.ok(allowed(e, c.equipment), `${e.id} needs other equipment ${tag}`);
      const plan = plannedSets(s, weekly, f, { ordinal: muscleOrdinal(prog, i) });
      for (const e of s.exercises) total[e.muscle] = (total[e.muscle] || 0) + plan[e.id];
      // compounds before isolations for the session's first exercise
      assert.equal(s.exercises[0].kind, "C", `${s.name} starts with a compound ${tag}`);
    }
    for (const m of Object.keys(MUSCLES)) {
      assert.ok(f[m] >= 2, `${m} trained ${f[m]}x ${tag}`);
      const [lo, hi] = SET_RANGE[m];
      assert.equal(total[m], weekly[m]); assert.ok(total[m] >= lo && total[m] <= hi, `${m} ${total[m]} sets/wk ${tag}`);
    }
    for (const m of MAJOR) assert.deepEqual(SET_RANGE[m], [10, 20]);
    if (c.experience === "novice") for (const s of prog) for (const e of s.exercises) assert.ok(!["pullup", "dip"].includes(e.id), `novice gets easy swap ${tag}`);
  }
});

test("sensible exercises per equipment and beginner swaps", () => {
  const ids = (c) => buildProgram(c).flatMap((s) => s.exercises.map((e) => e.id));
  assert.ok(ids({ days: 4, equipment: "full" }).includes("bench"));
  assert.ok(ids({ days: 4, equipment: "full" }).includes("pullup"));
  assert.ok(ids({ days: 4, equipment: "full", experience: "novice" }).includes("pulldown"));
  assert.ok(ids({ days: 4, equipment: "full", experience: "novice" }).includes("assistdip"));
  assert.ok(ids({ days: 4, equipment: "dumbbells" }).every((id) => ["d", "b"].includes(LIBRARY[id].eq)));
  assert.ok(ids({ days: 4, equipment: "home" }).every((id) => ["b", "n"].includes(LIBRARY[id].eq)));
  for (const m of ["glutes", "reardelts", "abs"]) assert.ok(ids({ days: 4 }).some((id) => LIBRARY[id].muscle === m), m);
  // dumbbell isolations progress in 2 kg jumps
  for (const e of Object.values(LIBRARY)) if (e.eq === "d") assert.ok(e.step >= 2, e.id);
});

test("swap alternatives: same muscle, allowed equipment, not already in the session; swaps persist in buildProgram", () => {
  const alts = alternatives("bench", "dumbbells", ["dbbench"]);
  assert.ok(alts.length >= 2);
  for (const a of alts) { assert.equal(a.muscle, "chest"); assert.ok(["d", "b"].includes(a.eq)); assert.notEqual(a.id, "dbbench"); }
  const p = buildProgram({ days: 4, swaps: { "upperA:chestA1": "dbbench" } });
  assert.equal(p[0].exercises[0].id, "dbbench");
  assert.equal(buildProgram({ days: 4, equipment: "home", swaps: { "upperA:chestA1": "bench" } })[0].exercises[0].id, "pushup", "swap ignored if equipment can't do it");
});

test("double progression: auto-filled reps never count; real top reps add the step; RIR 4+ flagged", () => {
  const bench = LIBRARY.bench, lat = LIBRARY.latraise, push = LIBRARY.pushup;
  const set = (w, r, o = {}) => ({ weight: w, reps: r, done: true, rir: 2, ...o });
  assert.equal(progression(bench, null).weight, "");
  assert.deepEqual([progression(bench, { sets: [set(60, 10), set(60, 10), set(60, 10)] }).weight, progression(bench, { sets: [set(60, 10), set(60, 10), set(60, 10)] }).increase], [62.5, true]);
  assert.equal(progression(bench, { sets: [set(60, 10), set(60, 9)] }).weight, 60);
  assert.equal(progression(bench, { sets: [set(60, 10, { auto: true }), set(60, 10, { auto: true })] }).increase, false, "auto reps don't progress");
  assert.equal(progression(bench, { sets: [set(60, 10), { weight: 60, reps: "", done: false }] }).increase, false, "every set must be done");
  assert.equal(progression(lat, { sets: [set(10, 20), set(10, 20)] }).weight, 12, "dumbbell isolation +2 kg");
  const bw = progression(push, { sets: [set("", 20), set("", 20)] });
  assert.equal(bw.increase, true); assert.match(bw.text, /harder variation/);
  assert.match(progression(bench, { sets: [set(60, 8, { rir: 5 })] }).text, /RIR 4\+/);
  assert.match(progression(bench, { sets: [set(60, 10)] }, { deload: true }).text, /Deload/);
});

test("rest timer lengths: 3 min heavy compounds, 2.5 min compounds, 1.5 min isolations", () => {
  assert.equal(restSeconds(LIBRARY.bench), 180);
  assert.equal(restSeconds(LIBRARY.csrow), 150);
  assert.equal(restSeconds(LIBRARY.latraise), 90);
});

test("calorie goal override: macros add up, low goals trim fat then carbs, warnings set", () => {
  for (const kg of [60, 70, 80, 100, 130]) for (const goal of [1200, 1800, 2400, 3000, 3600, 4500, 6000]) {
    const t = dailyTargets({ bodyweightKg: kg, calorieGoal: goal });
    const sum = t.proteinG * 4 + t.fatG * 9 + t.carbG * 4;
    assert.ok(Math.abs(sum - t.kcal) <= 3, `${kg}kg ${goal}: ${sum} vs ${t.kcal}`);
    assert.ok(t.fatG >= Math.round(kg * 0.6) && t.proteinG >= Math.round(kg * 1.6));
    assert.equal(t.belowMaintenance, t.kcal < kg * 35);
  }
  const low = dailyTargets({ bodyweightKg: 80, calorieGoal: 2000 });
  assert.equal(low.proteinG, 176); assert.ok(low.fatReduced); assert.ok(low.belowMaintenance);
  const lowest = dailyTargets({ bodyweightKg: 80, calorieGoal: 900 });
  assert.ok(lowest.goalTooLow); assert.ok(lowest.kcal > 900);
  for (const kg of [70, 80, 100]) { const t = dailyTargets({ bodyweightKg: kg }); assert.ok(Math.abs(t.proteinG * 4 + t.fatG * 9 + t.carbG * 4 - t.kcal) <= 3); assert.equal(t.fatReduced, false); }
});

test("autoregulation uses the muscle's own range", () => {
  assert.equal(autoregulate(12, 0.01, "good", [6, 12]).weeklySets, 12);
  assert.equal(autoregulate(6, -0.1, "good", [6, 12]).weeklySets, 6);
});

test("weekly tracker counts this week's done sets per muscle (Mon-Sun)", () => {
  const now = new Date(2026, 9, 21, 12).getTime(); // Wed
  assert.equal(new Date(weekStart(now)).getDay(), 1);
  const h = [
    { date: new Date(2026, 9, 18, 10).toISOString(), exercises: { bench: { sets: [{ done: true }, { done: true }] } } }, // last Sunday
    { date: new Date(2026, 9, 19, 10).toISOString(), exercises: { bench: { sets: [{ done: true }, { done: false }] }, inclinedb: { sets: [{ done: true }] }, squat: { sets: [{ done: true }] } } },
  ];
  assert.deepEqual(weeklyDone(h, (id) => LIBRARY[id]?.muscle, now), { chest: 2, quads: 1 });
});

test("deload: suggested after ~6 weeks or when main lifts stall 2 sessions; not when progressing", () => {
  const DAY = 864e5, now = Date.now();
  const mk = (daysAgo, w) => ({ date: new Date(now - daysAgo * DAY).toISOString(), exercises: { bench: { sets: [{ weight: w, reps: 8, done: true }] }, squat: { sets: [{ weight: w + 40, reps: 8, done: true }] } } });
  assert.equal(deloadCheck({ history: [mk(10, 60), mk(7, 62), mk(4, 64), mk(1, 66)], mainLiftIds: ["bench", "squat"], now }).suggest, false);
  assert.equal(deloadCheck({ history: [mk(10, 60), mk(7, 64), mk(4, 62), mk(1, 63)], mainLiftIds: ["bench", "squat"], now }).suggest, true);
  const old = [mk(45, 60), mk(30, 62), mk(15, 64), mk(1, 66)];
  assert.match(deloadCheck({ history: old, mainLiftIds: ["bench"], now }).reason, /6\+ weeks/);
  assert.equal(deloadCheck({ history: old, mainLiftIds: ["bench"], since: now - 20 * DAY, now }).suggest, false, "clock resets after a deload");
  assert.equal(e1rmSeries(old, "bench").length, 4);
});

test("migration keeps v1 data under the same key shape", () => {
  const v1 = { profile: { bodyweightKg: 82, experience: "intermediate", maintenanceKcal: null, calorieGoal: null },
    weeklySets: { chest: 16, back: 15, quads: 14, hamstrings: 12, delts: 13, biceps: 11, triceps: 11, calves: 10 }, nextSession: 2,
    history: [{ date: "2026-10-01T05:00:00.000Z", session: "upperA", durationMin: 70, hardSets: 30, recovery: "good", exercises: { bench: { sets: [{ weight: 80, reps: 8, done: true }] } } }],
    weighIns: [{ date: "2026-10-01", kg: 82 }], kcalAdjust: 150, lastKcalAdjustAt: 1, lastSummary: null,
    active: { sessionIdx: 2, startedAt: 1, recovery: "good", exercises: { pullup: { sets: [{ weight: 10, reps: "", done: false }] }, machpress: { sets: [{ weight: 50, reps: 8, done: true }] } } } };
  const s = migrate(JSON.parse(JSON.stringify(v1)));
  assert.equal(s.schema, SCHEMA);
  assert.equal(s.profile.days, 4); assert.equal(s.profile.equipment, "full"); assert.equal(s.profile.bodyweightKg, 82);
  assert.equal(s.weeklySets.chest, 16); assert.equal(s.weeklySets.glutes, START_WEEKLY_SETS.glutes);
  assert.equal(s.history[0].name, "Upper A"); assert.equal(s.history[0].exercises.bench.sets[0].weight, 80);
  assert.equal(s.kcalAdjust, 150); assert.equal(s.nextSession, 2);
  assert.equal(s.active.session.name, "Upper B"); assert.deepEqual(s.active.session.exercises.map((e) => e.id), ["pullup", "machpress"]);
  assert.equal(s.active.exercises.pullup.sets[0].rir, "");
  assert.equal(migrate(null), null); assert.equal(migrate([1]), null);
  assert.deepEqual(migrate(fresh()).history, []);
});

test("progress indicator: missing reps to the top, earned only with typed reps at target RIR", () => {
  const b = LIBRARY.bench; // 6-10, +2.5
  const set = (r, o = {}) => ({ weight: 60, reps: r, rir: 2, done: true, ...o });
  let st = progressStatus(b, [set(10), set(9), set(8)]);
  assert.equal(st.missingReps, 3); assert.equal(st.earned, false); assert.equal(st.pct, 90);
  st = progressStatus(b, [set(10), set(10), set(10)]);
  assert.equal(st.earned, true); assert.equal(st.nextWeight, 62.5); assert.equal(st.pct, 100);
  assert.equal(progressStatus(b, [set(10), set(10, { rir: 0 })]).earned, false, "to failure isn't target RIR");
  assert.equal(progressStatus(b, [set(10), set(10, { rir: "" })]).earned, true, "blank RIR assumed on target");
  st = progressStatus(b, [set(10), set(6, { auto: true }), { weight: 60, reps: "", done: false }]);
  assert.equal(st.earned, false); assert.equal(st.missingSets, 1); assert.equal(st.autoSets, 1); assert.equal(st.missingReps, 4);
  assert.equal(progressStatus(b, [set(10), set(10, { auto: true })]).earned, false, "auto-filled top reps never earn");
  assert.equal(progressStatus(LIBRARY.latraise, [{ weight: 10, reps: 20, done: true }]).nextWeight, 12);
  assert.equal(progression(b, { sets: [set(10), set(10, { rir: 0 })] }).increase, false);
});

test("starting-weight helper: Epley e1RM -> (bottom of range + 2) RM, rounded down to 2.5 kg / 2 kg", () => {
  let r = startingWeight(LIBRARY.bench, 100, 5); // e1RM 116.7, 8RM
  assert.equal(r.e1rm, 116.7); assert.equal(r.rm, 8); assert.equal(r.weight, 90); assert.equal(r.inaccurate, false);
  r = startingWeight(LIBRARY.csrow, 60, 10); assert.equal(r.weight, 60); assert.equal(r.rm, 10);
  r = startingWeight(LIBRARY.inclinedb, 30, 8); assert.equal(r.weight, 28); assert.equal(r.inc, 2);
  r = startingWeight(LIBRARY.latraise, 12, 15); assert.equal(r.weight % 2, 0); assert.equal(r.inaccurate, true);
  assert.equal(startingWeight(LIBRARY.bench, 40, 15).weight, 45);
  assert.equal(startingWeight(LIBRARY.bench, "", 5), null); assert.equal(startingWeight(LIBRARY.bench, 100, 0), null);
});

test("exercise illustrations: one per exercise, bundled, small, cached by the service worker", async () => {
  const { EX_IMG } = await import("../images.js");
  const fs = await import("node:fs");
  const root = new URL("..", import.meta.url).pathname;
  const fallbacks = Object.keys(LIBRARY).filter((id) => !EX_IMG[id]);
  assert.deepEqual(fallbacks, [], "every exercise (incl. all swap alternatives) has an illustration");
  const sw = fs.readFileSync(root + "sw.js", "utf8");
  const swImgs = JSON.parse(sw.match(/const IMAGES = (\[.*?\]);/)[1]);
  assert.deepEqual(swImgs.sort(), [...new Set(Object.values(EX_IMG).map(([p]) => "./" + p))].sort());
  for (const [p] of Object.values(EX_IMG)) {
    assert.ok(!p.startsWith("http"), "no hotlinking");
    const size = fs.statSync(root + p).size; assert.ok(size > 2000 && size <= 60000, `${p} ${size} B`);
  }
  assert.match(sw, /"\.\/images\.js"/);
  for (const id of Object.keys(LIBRARY)) assert.equal(EX_IMG[id][0], `img/ex/${id}.webp`);
  const exFiles = fs.readdirSync(root + "img/ex").sort();
  assert.deepEqual(exFiles, Object.keys(LIBRARY).map((id) => id + ".webp").sort(), "no leftover old photos");
  const head = fs.readFileSync(root + "img/ex/bench.webp").subarray(0, 30);
  assert.equal(head.subarray(0, 4).toString(), "RIFF"); assert.equal(head.subarray(8, 12).toString(), "WEBP");
});

test("one-exercise workout helpers: clamp, status, swipe, label; migration keeps/clamps the position", async () => {
  const { clampIndex, exerciseStatus, swipeDir, positionLabel } = await import("../stepper.js");
  assert.equal(clampIndex(3, 8), 3); assert.equal(clampIndex(99, 8), 7); assert.equal(clampIndex(-2, 8), 0); assert.equal(clampIndex(undefined, 8), 0); assert.equal(clampIndex("x", 8), 0); assert.equal(clampIndex(2, 0), 0);
  assert.equal(exerciseStatus([]), "todo");
  assert.equal(exerciseStatus([{ done: false }, { done: false }]), "todo");
  assert.equal(exerciseStatus([{ done: true }, { done: false }]), "partial");
  assert.equal(exerciseStatus([{ done: true }, { done: true }]), "done");
  assert.equal(swipeDir(-100, 10), -1); assert.equal(swipeDir(100, -10), 1); assert.equal(swipeDir(-30, 0), 0); assert.equal(swipeDir(-100, 90), 0, "mostly vertical = scroll");
  assert.equal(positionLabel(2, 8), "Exercise 3 of 8");
  const { migrate } = await import("../state.js");
  const active = (cur) => ({ schema: 2, profile: { bodyweightKg: 80 }, history: [], active: { sessionIdx: 0, startedAt: 1, recovery: "good", cur,
    session: { id: "upperA", name: "Upper A", exercises: [{ ...LIBRARY.bench }, { ...LIBRARY.csrow }] }, exercises: { bench: { sets: [] }, csrow: { sets: [] } } } });
  assert.equal(migrate(active(undefined)).active.cur, 0, "older saves without a position start on exercise 1");
  assert.equal(migrate(active(1)).active.cur, 1);
  assert.equal(migrate(active(9)).active.cur, 1, "out-of-range position clamped");
});

test("image rendering is centralised in media.js (style swap = data + IMAGE_STYLE)", async () => {
  const { exMedia, thumbHTML, heroHTML, photoHTML, IMAGE_STYLE } = await import("../media.js");
  const m = exMedia("bench"); assert.ok(m.src.startsWith("img/ex/") && m.alt.includes("Barbell bench press"));
  assert.equal(exMedia("nope"), null, "unknown id -> fallback");
  assert.match(thumbHTML(LIBRARY.bench), /class="exthumb" data-img="bench"/);
  const fake = { id: "nope", name: "Mystery", muscle: "chest", reps: [8, 12] };
  assert.match(thumbHTML(fake), /exthumb fallback/);
  assert.match(heroHTML(LIBRARY.bench), /class="exhero" data-img="bench"/);
  assert.equal(IMAGE_STYLE.layout, "single"); assert.ok(!/Start|Finish|hero-cap/.test(heroHTML(LIBRARY.bench)), "one frame, no start/finish captions");
  assert.match(heroHTML(fake), /exhero fallback/);
  assert.match(photoHTML(LIBRARY.bench), /Illustration generated for Get Jacked/); assert.ok(!/free-exercise-db|Photo:/.test(photoHTML(LIBRARY.bench)));
  const prev = { ...IMAGE_STYLE }; Object.assign(IMAGE_STYLE, { layout: "pair", frames: ["Start", "Finish"] });
  assert.match(heroHTML(LIBRARY.bench), /hero-cap.*Start.*Finish/s, "a two-frame style is still just a data change");
  Object.assign(IMAGE_STYLE, prev);
});

test("friend folders (/ben/, /laychan/) are generated from the root app and up to date", async () => {
  const fs = await import("node:fs");
  const root = new URL("..", import.meta.url).pathname;
  const { build, friendFiles } = await import("../scripts/build-friends.mjs");
  assert.deepEqual(build({ check: true }), [], "run `npm run build:friends`");
  const { friends } = JSON.parse(fs.readFileSync(root + "friends.json", "utf8"));
  assert.deepEqual(friends.map((f) => f.slug), ["ben", "laychan"]);
  const { createHash } = await import("node:crypto");
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  for (const f of friends) {
    assert.equal(f.passSha256, sha(f.slug), "password = slug, stored only as a hash");
    const files = friendFiles(f), user = files["user.js"];
    assert.match(user, new RegExp(`"storagePrefix": "${f.slug}:"`)); assert.match(user, new RegExp(f.passSha256)); assert.match(user, /"assetBase": "\.\.\/"/);
    const m = JSON.parse(files["manifest.webmanifest"]);
    assert.equal(m.name, "Get Jacked"); assert.equal(m.id, "./"); assert.equal(m.scope, "./"); assert.equal(m.start_url, "./#/today");
    assert.ok(m.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512"));
    assert.match(files["sw.js"], new RegExp(`const VERSION = "get-jacked-v\\d+-${f.slug}${f.theme ? `-${f.theme}-[0-9a-f]{8}` : ""}"`));
    assert.match(files["sw.js"], /"\.\.\/app\.js"/); assert.match(files["sw.js"], /"\.\/user\.js"/);
    assert.match(files["sw.js"], /"\.\.\/img\/xplosiv-x\.svg"/, "Xplosiv X precached");
    if (!f.theme) {
      assert.match(files["sw.js"], /"\.\.\/img\/ex\/bench\.webp"/);
      assert.doesNotMatch(files["index.html"] + files["sw.js"] + user, /themes\/|ex-orange|"theme"/, "unthemed friend gets no theme");
    } else {
      // themed friend: extra stylesheet(s) + body class(es), own image set (every file present), assets precached.
      // A theme with "base" (e.g. hilux on falcon) gets the base theme's files first, then its own.
      const tj = (n) => JSON.parse(fs.readFileSync(`${root}themes/${n}/theme.json`, "utf8")), chain = [];
      for (let n = f.theme; n; n = tj(n).base) { assert.ok(!chain.includes(n), "no base loop"); chain.unshift(n); }
      const ts = chain.map((n) => ({ n, ...tj(n) })), t = { ...ts[0], ...ts.at(-1), exImgDir: ts.map((x) => x.exImgDir).filter(Boolean).at(-1) };
      assert.match(files["index.html"], new RegExp(`<link rel="stylesheet" href="\\.\\./styles\\.css">${ts.map((x) => `\\s*<link rel="stylesheet" href="\\.\\./themes/${x.n}/${x.css}">`).join("")}\\s*</head>`));
      assert.match(files["index.html"], new RegExp(`<body class="${chain.map((n) => `theme-${n}`).join(" ")}">`));
      assert.match(user, new RegExp(`"theme": "${f.theme}"`)); assert.match(user, new RegExp(`"exImgDir": "${t.exImgDir}"`));
      const js = ts.filter((x) => x.js);
      if (js.length) assert.match(files["index.html"], new RegExp(`<script src="user\\.js"></script>${js.map((x) => `\\s*<script src="\\.\\./themes/${x.n}/${x.js}"></script>`).join("")}\\s*<script type="module" src="\\.\\./app\\.js">`), "theme script(s) after user.js, before the app");
      for (const x of ts) for (const a of [x.css, ...(x.js ? [x.js] : []), ...x.assets]) assert.ok(files["sw.js"].includes(`"../themes/${x.n}/${a}"`), a);
      if (chain.includes("falcon")) assert.equal(tj("falcon").assets.filter((a) => /^meals\/\d-[a-z-]+\.webp$/.test(a)).length, 9, "falcon: 9 cheat-meal pictures precached");
      assert.doesNotMatch(files["sw.js"], /"\.\.\/img\/ex\//, "themed friend precaches only its own image set");
      for (const id of Object.keys(LIBRARY)) { assert.ok(files["sw.js"].includes(`"../${t.exImgDir}${id}.webp"`), id); assert.ok(fs.statSync(`${root}${t.exImgDir}${id}.webp`).size > 1000, id); }
    }
    if (!f.theme) assert.match(files["index.html"], /<script src="user\.js"><\/script>\s*<script type="module" src="\.\.\/app\.js">/);
    for (const i of ["icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon-180.png", "favicon-32.png"]) assert.ok(fs.statSync(`${root}${f.slug}/icons/${i}`).size > 200, i);
  }
  // Zane's root app keeps its own password and original storage keys
  globalThis.GJ_CONFIG = undefined;
  const { CONFIG } = await import("../config.js");
  assert.equal(CONFIG.passSha256, sha("zane")); assert.equal(CONFIG.storagePrefix, ""); assert.equal(CONFIG.assetBase, "");
  assert.match(fs.readFileSync(root + "sw.js", "utf8"), /"\.\/config\.js"/);
  assert.match(fs.readFileSync(root + "sw.js", "utf8"), /"\.\/img\/xplosiv-x\.svg"/, "Xplosiv X in the shared precache");
  assert.ok(fs.statSync(root + "img/xplosiv-x.svg").size > 100);
});
