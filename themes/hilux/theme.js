// Ben's Toyota Hilux theme: loaded after ../themes/falcon/theme.js on his copy only (theme.json "base": "falcon").
// It keeps the falcon Today layout, Cheat meals sheet and Supplements tile exactly as they are and only swaps the three
// home artworks (Toyota badge + "Hilux Edition" header, Hilux hero, "Toyota Hilux" Built Different banner) and their alt text.
(function () {
  const H = new URL(".", document.currentScript.src).href, F = new URL("../falcon/", H).href;
  const base = globalThis.GJ_THEME;
  if (!base || !base.today) return;
  const SWAPS = [
    [`${F}home-top.webp`, `${H}home-top.webp`],
    [`${F}home-hero.webp`, `${H}home-hero.webp`],
    [`${F}home-built.webp`, `${H}home-built.webp`],
    ['alt="Get Jacked · G6E Falcon Edition"', 'alt="Get Jacked · Hilux Edition"'],
    ['alt="Built different · G6E Falcon"', 'alt="Built different · Toyota Hilux"'],
  ];
  const today = base.today;
  globalThis.GJ_THEME = Object.assign({}, base, {
    today(d) { let html = today.call(base, d); for (const [a, b] of SWAPS) html = html.split(a).join(b); return html; },
  });
})();
