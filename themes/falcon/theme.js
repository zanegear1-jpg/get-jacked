// Laychan's FG Falcon G6E theme: Today-page layout (home v4, from Zane's mockup + mark-ups). Loaded after user.js on her
// copy only (scripts/build-friends.mjs, theme.json "js"). app.js calls GJ_THEME.today(d) with the real next-session data
// and the existing cards (deload / session list / this week / daily targets / iOS hint), then wires #start itself, so
// Start/Resume behaves exactly as on every other copy. Art: home-top (black Ford oval composited where the mockup's
// dumbbell was) / home-hero / home-built.webp; the hero's baked "TODAY…" text and chips were painted out so they can be
// live HTML. Four tiles: Workouts, Progress, Cheat meals (bottom-sheet, below) and Supplements (the Xplosiv link, which
// replaces the X floated beside her exercise list).
(function () {
  const B = new URL(".", document.currentScript.src).href;
  const MEALS = [
    ["1-chicken-rice", "Chicken and microwave rice", "One pouch rice + a packet of cooked chicken.", "~30–45 g protein", "2 minutes", "Add a sauce sachet. Check the chicken label to make sure you hit 40 g."],
    ["2-yoghurt", "High-protein yoghurt", "One large tub of high-protein yoghurt + banana.", "~25–40 g protein", "No cooking", "Choose a tub with 30 g or more protein; add a ready-to-drink protein shake if needed."],
    ["3-shake", "Protein shake", "Two scoops of whey mixed with water or milk.", "~40–55 g protein", "1 minute", "Check the label for protein per scoop."],
    ["4-boiled-eggs", "Pre-boiled eggs", "Boil a batch once, then keep them refrigerated for quick snacks.", "~25 g protein per 4 eggs", "Ready to eat", "Pair with a protein yoghurt or milk to get near 40 g."],
    ["5-fridge-chicken", "Chicken straight from the fridge", "Ready-cooked chicken breast pieces + a bread roll or wrap.", "~35–50 g protein", "1 minute", "Buy cooked chicken, portion it into containers and grab one each morning."],
    ["6-eggs-beans", "Eggs and baked beans", "4 eggs + 1 can baked beans.", "40–45 g protein", "Around 5 minutes, one pan and one can", "Cook the eggs, heat the beans, and eat with toast if you want extra carbs.", "Easiest way to hit 40 g"],
    ["7-eggs-toast", "Eggs on toast", "4 eggs + 2 slices toast.", "30–34 g protein"],
    ["8-beans-toast", "Beans on toast", "1 can baked beans + 2 slices toast.", "18–23 g protein"],
    ["9-eggs-beans-toast", "Eggs and beans on toast", "3 eggs + ½ can beans + 2 slices toast.", "30–35 g protein"],
  ];
  const tile = (cls, attrs, title, sub, icon = "<i aria-hidden=\"true\"></i>") =>
    `<${attrs.startsWith("href") ? "a" : "button type=\"button\""} class="fx-tile ${cls}" ${attrs}>${icon}<strong>${title}</strong><span>${sub}</span><b aria-hidden="true"></b></${attrs.startsWith("href") ? "a" : "button"}>`;

  // ---- Cheat meals bottom sheet: X, backdrop tap, Escape or the back gesture close it ----
  let sheet = null, pushed = false, opener = null;
  function sheetHTML() {
    return `<div class="fx-sheet-bg" data-fx-close></div>
  <div class="fx-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="fx-meals-h">
    <header><div><h2 id="fx-meals-h">Cheat meals</h2><p>Fast high-protein meals when there's no time to cook</p></div>
      <button type="button" class="fx-x" data-fx-close aria-label="Close cheat meals"></button></header>
    <ol class="fx-meals">${MEALS.map(([img, t, need, prot, time, tip, badge], i) => `
      <li class="fx-meal${badge ? " hot" : ""}"><img src="${B}meals/${img}.webp" width="320" height="320" alt="" loading="lazy" decoding="async">
        <div>${badge ? `<em class="fx-badge">${badge}</em>` : ""}<h3>${i + 1}. ${t}</h3><p class="need">${need}</p>
        <p class="pt"><strong>${prot}</strong>${time ? ` · ${time}` : ""}</p>${tip ? `<p class="tip">${tip}</p>` : ""}</div></li>`).join("")}
    </ol></div>`;
  }
  function openMeals(from) {
    if (sheet) return;
    opener = from || null;
    sheet = document.createElement("div"); sheet.className = "fx-sheet"; sheet.innerHTML = sheetHTML();
    document.body.appendChild(sheet); document.documentElement.classList.add("fx-noscroll");
    requestAnimationFrame(() => sheet && sheet.classList.add("open"));
    history.pushState({ fxMeals: 1 }, "", location.href); pushed = true; // same URL: no hashchange, so the back gesture just closes
    sheet.querySelector(".fx-x").focus({ preventScroll: true });
  }
  function closeMeals(fromPop) {
    if (!sheet) return;
    sheet.remove(); sheet = null; document.documentElement.classList.remove("fx-noscroll");
    if (pushed && !fromPop) { pushed = false; history.back(); } else pushed = false;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null;
  }
  document.addEventListener("click", (e) => {
    const o = e.target.closest?.("[data-fx-meals]"); if (o) { e.preventDefault(); openMeals(o); return; }
    if (sheet && e.target.closest?.("[data-fx-close]")) closeMeals();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) { e.stopPropagation(); closeMeals(); } }, true);
  window.addEventListener("popstate", () => { if (sheet) closeMeals(true); });
  window.addEventListener("hashchange", () => { if (sheet) { pushed = false; closeMeals(true); } });

  globalThis.GJ_THEME = {
    meals: MEALS.length, openMeals, closeMeals,
    today(d) {
      const e = d.esc, f = d.first, x = d.xplosiv;
      const chips = f ? `<ul class="fx-chips" aria-label="First exercise">
          <li class="c-sets">${f.sets} sets</li><li class="c-reps">${f.reps[0]}–${f.reps[1]} reps</li>
          <li class="c-rir">RIR ${f.rir}</li><li class="c-rest">rest ${f.restMin} min</li></ul>` : "";
      // Rest day (app.js d.rest): same hero, "Today: Rest day" and the recovery line in place of the chips; at the bottom
      // the week strip with the next session pill directly under it. Training days keep the strip alone in the corner.
      const r = d.rest;
      const heroTxt = r
        ? `<h1 class="fx-title"><span>Today:</span> <em>Rest day</em></h1>
          <p class="fx-rd-line" id="rest-line">${r.line}</p>`
        : `<h1 class="fx-title"><span>Today:</span> <em>${e(d.name)}</em></h1>${chips}`;
      const foot = r
        ? `<div class="fx-rd-foot">${d.strip || ""}<p class="fx-rd-next" id="rest-next">Next: <b>${e(r.next)}</b> ${r.when}</p></div>`
        : d.strip || "";
      return `
  <div class="fx-home${r ? " fx-restday" : ""}">
    <div class="fx-art fx-top"><img src="${B}home-top.webp" width="1024" height="150" alt="Get Jacked · G6E Falcon Edition"><a class="fx-gear" href="#/settings" aria-label="Settings"></a></div>
    <section class="fx-art fx-hero" aria-label="${r ? "Rest day" : "Next session"}"><img src="${B}home-hero.webp" width="1024" height="585" alt="">
      <div class="fx-hero-txt">${heroTxt}</div>${foot}
    </section>
    <button class="fx-start${d.active ? " resume" : ""}" id="start"><i aria-hidden="true"></i><span>${d.startLabel}</span><b aria-hidden="true"></b></button>
    <div class="fx-tiles">
      ${tile("t-w", 'href="#/workout"', "Workouts", "View &amp; log")}
      ${tile("t-p", 'href="#/progress"', "Progress", "Track your gains")}
      ${tile("t-c", 'data-fx-meals aria-haspopup="dialog"', "Cheat meals", "Fast protein")}
      ${tile("t-x", `href="${x.url}" id="xplosiv" target="_blank" rel="noopener" aria-label="Xplosiv clearance deals"`, "Supplements", "Xplosiv clearance", `<img class="fx-xi" src="${x.img}" alt="" width="101" height="76">`)}
    </div>
    <img class="fx-art fx-built" src="${B}home-built.webp" width="1024" height="210" alt="Built different · G6E Falcon">
    <div class="fx-below">${d.deload}${d.sessionNoX}${d.week}${d.nutrition}${d.ios}</div>
  </div>`;
    },
  };
})();
