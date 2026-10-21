// Exercise image rendering. Everything that knows what an exercise picture looks like lives here,
// so a new image style (e.g. illustrated graphics) is a change to EX_IMG data + IMAGE_STYLE, not to the screens.
import { EX_IMG } from "./images.js";
import { LIBRARY, MUSCLES } from "./program.js";
import { CONFIG } from "./config.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Current style. layout "pair" = one file showing start|finish side by side; "single" = one frame. */
export const IMAGE_STYLE = {
  layout: "single",
  thumbPosition: "50% 50%",          // which part of the file a square thumbnail shows
  frames: [],                        // captions under the enlarged image (pair layout only)
  credit: () => "Illustration generated for Get Jacked.",
  background: "#111",
};

const MUSCLE_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M2 10h2V8h2v8H4v-2H2zm4-3h2v10H6zm10 0h2v10h-2zm2 1h2v2h2v4h-2v2h-2zM8 11h8v2H8z"/></svg>`;

/** Normalised image info for an exercise, or null (use the muscle-icon fallback). */
export function exMedia(id) {
  const im = EX_IMG[id], ex = LIBRARY[id];
  if (!im || !ex) return null;
  const file = CONFIG.exImgDir ? im[0].replace(/^img\/ex\//, CONFIG.exImgDir) : im[0];
  return { src: CONFIG.assetBase + file, source: im[1], alt: `${ex.name}: ${IMAGE_STYLE.layout === "pair" ? "start and finish positions" : "how to do it"}`, credit: IMAGE_STYLE.credit(im[1]) };
}
const styleAttr = () => `style="object-position:${IMAGE_STYLE.thumbPosition};background:${IMAGE_STYLE.background}"`;

/** Small square thumbnail (lists, swap sheet). Tap opens the enlarged view. */
export function thumbHTML(ex) {
  const m = exMedia(ex.id);
  if (!m) return `<div class="exthumb fallback" aria-label="${esc(MUSCLES[ex.muscle])} exercise">${MUSCLE_ICON}<span>${esc(MUSCLES[ex.muscle])}</span></div>`;
  return `<button type="button" class="exthumb" data-img="${ex.id}" aria-label="Show how to do ${esc(ex.name)}"><img src="${m.src}" alt="" width="72" height="72" loading="lazy" decoding="async" ${styleAttr()}></button>`;
}

/** Big image across the top of the one-exercise workout screen. */
export function heroHTML(ex) {
  const m = exMedia(ex.id);
  if (!m) return `<div class="exhero fallback" aria-label="${esc(MUSCLES[ex.muscle])} exercise">${MUSCLE_ICON.replace(/30/g, "56")}<span>${esc(MUSCLES[ex.muscle])}</span></div>`;
  return `<button type="button" class="exhero" data-img="${ex.id}" aria-label="Enlarge how to do ${esc(ex.name)}"><img src="${m.src}" alt="${esc(m.alt)}" decoding="async" style="background:${IMAGE_STYLE.background}">
    ${IMAGE_STYLE.layout === "pair" ? `<span class="hero-cap small">${IMAGE_STYLE.frames.map((f) => `<span>${f}</span>`).join("")}</span>` : ""}</button>`;
}

/** Contents of the enlarged view (#photo). */
export function photoHTML(ex) {
  const m = exMedia(ex.id); if (!m) return "";
  return `<div class="lb-card" role="dialog" aria-modal="true" aria-label="${esc(ex.name)}">
    <div class="lb-head"><strong>${esc(ex.name)}</strong><button type="button" class="lb-x" aria-label="Close">✕</button></div>
    <img src="${m.src}" alt="${esc(m.alt)}">
    ${IMAGE_STYLE.layout === "pair" ? `<div class="lb-cap small">${IMAGE_STYLE.frames.map((f) => `<span>${f}</span>`).join("")}</div>` : ""}
    <p class="small muted">${ex.reps[0]}–${ex.reps[1]} reps, controlled, full range. ${m.credit}</p></div>`;
}
