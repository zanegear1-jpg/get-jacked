// Rest days made Today depend on the weekday. So the browser tests behave the same on any day of the week, every page
// they open runs on the most recent Monday (same time of day): a training day for every split. The rest-day tests set
// their own dates with page.clock.
export const MONDAY_OFFSET = ((new Date().getDay() + 6) % 7) * 864e5; // ms back to the last Monday (0 on a Monday)
export const mondayNow = () => Date.now() - MONDAY_OFFSET;
function shim(off) {
  if (!off) return;
  const D = Date;
  class FakeDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() - off); } static now() { return D.now() - off; } }
  globalThis.Date = FakeDate;
}
/** Patch browser.newContext so every context gets the shim; returns the unpatched one (for page.clock tests). */
export function onTrainingDay(browser) {
  const raw = browser.newContext.bind(browser);
  browser.newContext = async (opts) => { const ctx = await raw(opts); await ctx.addInitScript(shim, MONDAY_OFFSET); return ctx; };
  return raw;
}
