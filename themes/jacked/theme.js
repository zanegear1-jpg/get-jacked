// Get Jacked theme (Zane's app + default for new copies): loaded after themes/falcon/theme.js (theme.json "base": "falcon").
// It keeps the falcon Today layout, Cheat meals sheet and Supplements tile exactly as they are and only swaps the three
// home artworks (logo + GET JACKED header, logo hero, GET JACKED / BUILT TUFF banner) and their alt text.
(function () {
  const H = new URL(".", document.currentScript.src).href, F = new URL("../falcon/", H).href;
  const base = globalThis.GJ_THEME;
  if (!base || !base.today) return;
  const SWAPS = [
    [`${F}home-top.webp`, `${H}home-top.webp`],
    [`${F}home-hero.webp`, `${H}home-hero.webp`],
    [`${F}home-built.webp`, `${H}home-built.webp`],
    ['alt="Get Jacked · G6E Falcon Edition"', 'alt="Get Jacked"'],
    ['alt="Built different · G6E Falcon"', 'alt="Get Jacked · Built tuff"'],
  ];
  const today = base.today;
  globalThis.GJ_THEME = Object.assign({}, base, {
    today(d) { let html = today.call(base, d); for (const [a, b] of SWAPS) html = html.split(a).join(b); return html; },
  });
})();
