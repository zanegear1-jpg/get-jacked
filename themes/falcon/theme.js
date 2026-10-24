// Laychan's FG Falcon G6E theme: Today-page layout (home v3, from Zane's mockup). Loaded after user.js on her copy only
// (scripts/build-friends.mjs, theme.json "js"). app.js calls GJ_THEME.today(d) with the real next-session data and the
// existing cards (deload / session list + Xplosiv X / this week / daily targets / iOS hint), then wires #start itself,
// so Start/Resume behaves exactly as on every other copy. Art: home-top/home-hero/home-built.webp (mockup artwork; the
// hero's baked "TODAY…" text and chips were painted out so they can be live HTML).
(function () {
  const B = new URL(".", document.currentScript.src).href;
  globalThis.GJ_THEME = {
    today(d) {
      const e = d.esc, f = d.first;
      const chips = f ? `<ul class="fx-chips" aria-label="First exercise">
          <li class="c-sets">${f.sets} sets</li><li class="c-reps">${f.reps[0]}–${f.reps[1]} reps</li>
          <li class="c-rir">RIR ${f.rir}</li><li class="c-rest">rest ${f.restMin} min</li></ul>` : "";
      return `
  <div class="fx-home">
    <div class="fx-art fx-top"><img src="${B}home-top.webp" width="1024" height="150" alt="Get Jacked · G6E Falcon Edition"><a class="fx-gear" href="#/settings" aria-label="Settings"></a></div>
    <section class="fx-art fx-hero" aria-label="Next session"><img src="${B}home-hero.webp" width="1024" height="585" alt="">
      <div class="fx-hero-txt"><h1 class="fx-title"><span>Today:</span> <em>${e(d.name)}</em></h1>${chips}</div>
    </section>
    <button class="fx-start${d.active ? " resume" : ""}" id="start"><i aria-hidden="true"></i><span>${d.startLabel}</span><b aria-hidden="true"></b></button>
    <div class="fx-tiles">
      <a class="fx-tile t-w" href="#/workout"><i aria-hidden="true"></i><strong>Workouts</strong><span>View &amp; log</span><b aria-hidden="true"></b></a>
      <a class="fx-tile t-p" href="#/progress"><i aria-hidden="true"></i><strong>Progress</strong><span>Track your gains</span><b aria-hidden="true"></b></a>
    </div>
    <img class="fx-art fx-built" src="${B}home-built.webp" width="1024" height="210" alt="Built different · G6E Falcon">
    <div class="fx-below">${d.deload}${d.session}${d.week}${d.nutrition}${d.ios}</div>
  </div>`;
    },
  };
})();
