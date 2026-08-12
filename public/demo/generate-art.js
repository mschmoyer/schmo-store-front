#!/usr/bin/env node
/**
 * RebelShops demo art generator.
 *
 * Emits deterministic, hand-art-directed SVG product photography for the three
 * demo storefronts. No network access, no rasters, no embedded fonts -- every
 * asset is pure vector geometry built from docs/design-system.md tokens.
 *
 * Usage:
 *   node public/demo/generate-art.js
 *   node public/demo/build.js            (the actual runner -- see that file)
 *   node public/demo/build.js --qa        (also writes silhouette QA renders to .scratch)
 *
 * Regenerating overwrites everything under public/demo/products, public/demo/hero
 * and public/demo/logo. The output is deterministic (no Math.random with a
 * volatile seed), so a re-run produces byte-identical files.
 *
 * Layout conventions (all product SVGs, 800x800 viewBox):
 *   - Every product is drawn in its own convenient "native" coordinate space and
 *     declares a `bbox` (its true drawn extent). `fitToStage()` then normalizes
 *     every product uniformly so its longest dimension is ~65% of the canvas
 *     (TARGET_MAX / 800), bottom-anchored on the shared ground line y=630. This
 *     is what keeps a keyboard and a candle at the same optical weight instead
 *     of one filling the frame and the other floating tiny in it.
 *   - Key light comes from the top-left (gradients run 0,0 -> 1,1 light-to-dark).
 *   - Stroke weight is a constant 3px hairline at 14% ink-900 opacity (or a
 *     4% paper rim-light on very dark fills) -- never mixed within one piece.
 *   - The store background is a bold, store-specific ground color (not a pale
 *     wash) with a soft paper-toned glow behind the product -- the three demo
 *     stores must be sortable by background color alone at grid scale.
 *   - The signal-dot brand accent is used ONLY on products that have a real
 *     indicator light in life (speaker, smartwatch, charging dock, power
 *     bank). Everywhere else it reads as a defect pixel, not a motif.
 */

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(__dirname);
const PRODUCTS_DIR = path.join(OUT_ROOT, 'products');
const HERO_DIR = path.join(OUT_ROOT, 'hero');
const LOGO_DIR = path.join(OUT_ROOT, 'logo');

for (const dir of [PRODUCTS_DIR, HERO_DIR, LOGO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Design tokens (mirrors docs/design-system.md -- do not invent new hexes)
// ---------------------------------------------------------------------------
const T = {
  ink950: '#08090B', ink900: '#0E1014', ink800: '#171A20', ink700: '#22262F',
  ink600: '#333944', ink500: '#5A626F', ink400: '#858D9A', ink300: '#B4BAC4',
  ink200: '#DCE0E6', ink100: '#ECEEF2', ink50: '#F5F6F8',
  paper: '#FBFAF8', paperRaised: '#FFFFFF', paperSunken: '#F2F1ED',
  ember50: '#FFF3EE', ember100: '#FFE1D5', ember200: '#FFC0A8', ember300: '#FF9871',
  ember400: '#FF6F3D', ember500: '#F94E1B', ember600: '#DC3A0C', ember700: '#B32D09',
  ember800: '#8A230A', ember900: '#5E1907',
  mint50: '#E8F8F1', mint500: '#0FA871', mint700: '#0B7D55',
  amber50: '#FEF6E6', amber500: '#D98A00', amber700: '#9C6300',
  rose50: '#FEECEB', rose500: '#D92D20',
};

/** Expand 3-digit hex shorthand ("#000") to 6-digit ("#000000"). No-op on 6-digit input. */
function expandHex(hex) {
  const h = hex.replace('#', '');
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
}

/** Blend two hex tokens from the design system to derive an in-palette mid-tone. */
function mix(hexA, hexB, t) {
  const a = expandHex(hexA);
  const b = expandHex(hexB);
  const ar = parseInt(a.slice(0, 2), 16), ag = parseInt(a.slice(2, 4), 16), ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16), bg = parseInt(b.slice(2, 4), 16), bb = parseInt(b.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  if ([r, g, bl].some((v) => Number.isNaN(v))) {
    throw new Error(`mix(): bad hex input "${hexA}" / "${hexB}" produced NaN -- check for a malformed hex literal`);
  }
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Tiny SVG builder -- every draw() call returns a body string; renderProduct()
// / renderHero() / renderLogo() assemble the full document.
// ---------------------------------------------------------------------------
let uid = 0;
const nid = (p) => `${p}${uid++}`;

// Silhouette QA mode: when on, every fill/stroke the primitives below emit is
// forced to solid black so a naming test can be run on shape alone. Toggled
// only by renderProductSilhouette(); catalog.js never touches this directly
// except through isSilhouette() for the couple of raw <text> labels.
let SILHOUETTE = false;
const isSilhouette = () => SILHOUETTE;

function linearGrad(id, stops, { x1 = 0, y1 = 0, x2 = 1, y2 = 1 } = {}) {
  const stopEls = stops
    .map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopEls}</linearGradient>`;
}

function radialGrad(id, stops, { cx = 0.35, cy = 0.3, r = 0.75 } = {}) {
  const stopEls = stops
    .map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`)
    .join('');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stopEls}</radialGradient>`;
}

function attrs(opts) {
  const a = [];
  const strokeColor = SILHOUETTE ? (opts.stroke ? '#000000' : undefined) : opts.stroke;
  if (strokeColor) a.push(`stroke="${strokeColor}"`);
  if (opts.strokeWidth) a.push(`stroke-width="${opts.strokeWidth}"`);
  if (!SILHOUETTE && opts.strokeOpacity != null) a.push(`stroke-opacity="${opts.strokeOpacity}"`);
  if (opts.strokeLinecap) a.push(`stroke-linecap="${opts.strokeLinecap}"`);
  if (opts.strokeDasharray) a.push(`stroke-dasharray="${opts.strokeDasharray}"`);
  if (!SILHOUETTE && opts.opacity != null) a.push(`opacity="${opts.opacity}"`);
  if (opts.transform) a.push(`transform="${opts.transform}"`);
  return a.length ? ' ' + a.join(' ') : '';
}

const rect = (x, y, w, h, rx, fill, opts = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${SILHOUETTE ? '#000000' : fill}"${attrs(opts)}/>`;

const ellipse = (cx, cy, rx, ry, fill, opts = {}) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${SILHOUETTE ? '#000000' : fill}"${attrs(opts)}/>`;

const circle = (cx, cy, r, fill, opts = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SILHOUETTE ? '#000000' : fill}"${attrs(opts)}/>`;

const path_ = (d, fill, opts = {}) => `<path d="${d}" fill="${SILHOUETTE ? '#000000' : fill}"${attrs(opts)}/>`;

const line = (x1, y1, x2, y2, stroke, w, opts = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SILHOUETTE ? '#000000' : stroke}" stroke-width="${w}"${attrs(opts)}/>`;

const group = (inner, opts = {}) => `<g${attrs(opts)}>${inner}</g>`;

// Standard hairline rim used on every shape edge for definition.
const RIM = { light: T.ink900, dark: T.paperRaised };
function rim(isDark) {
  return isDark
    ? { stroke: RIM.dark, strokeWidth: 3, strokeOpacity: 0.10 }
    : { stroke: RIM.light, strokeWidth: 3, strokeOpacity: 0.14 };
}

/** Vertical cylinder: two ellipses + a horizontally-shaded body rect. */
function cylinderV(defs, cx, topY, botY, rx, ry, lightHex, darkHex, isDark = false) {
  const bodyId = nid('cyl');
  const capId = nid('cap');
  defs.push(linearGrad(bodyId, [[0, lightHex], [0.55, darkHex], [1, darkHex]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
  defs.push(radialGrad(capId, [[0, lightHex, 1], [0.7, darkHex, 1], [1, darkHex, 1]], { cx: 0.35, cy: 0.35, r: 0.8 }));
  let s = '';
  s += ellipse(cx, botY, rx, ry, darkHex, rim(isDark));
  s += rect(cx - rx, topY, rx * 2, botY - topY, 0, `url(#${bodyId})`);
  s += line(cx - rx, topY, cx - rx, botY, RIM.light, 2, { strokeOpacity: isDark ? 0.06 : 0.12 });
  s += line(cx + rx, topY, cx + rx, botY, RIM.light, 2, { strokeOpacity: isDark ? 0.06 : 0.12 });
  s += ellipse(cx, topY, rx, ry, `url(#${capId})`, rim(isDark));
  return s;
}

/** Horizontal capsule/bar: left/right ellipses + vertically-shaded body rect. */
function capsuleH(defs, x1, x2, cy, rx, ry, lightHex, darkHex, isDark = false) {
  const bodyId = nid('bar');
  defs.push(linearGrad(bodyId, [[0, lightHex], [0.5, darkHex], [1, darkHex]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  let s = '';
  s += rect(x1, cy - ry, x2 - x1, ry * 2, 0, `url(#${bodyId})`);
  s += ellipse(x1, cy, rx, ry, lightHex, rim(isDark));
  s += ellipse(x2, cy, rx, ry, darkHex, rim(isDark));
  return s;
}

/** Soft studio sphere. */
function sphere(defs, cx, cy, r, lightHex, darkHex, isDark = false) {
  const id = nid('sph');
  defs.push(radialGrad(id, [[0, lightHex], [0.6, darkHex], [1, darkHex]], { cx: 0.32, cy: 0.28, r: 0.85 }));
  return circle(cx, cy, r, `url(#${id})`, rim(isDark));
}

/** Rounded box with diagonal top-left-light shading. */
function box(defs, x, y, w, h, rx, lightHex, darkHex, isDark = false) {
  const id = nid('box');
  defs.push(linearGrad(id, [[0, lightHex], [1, darkHex]]));
  return rect(x, y, w, h, rx, `url(#${id})`, rim(isDark));
}

/** Small ellipse specular highlight -- the recurring "glass glint". */
function glint(cx, cy, rx, ry, opacity = 0.4) {
  return ellipse(cx, cy, rx, ry, '#FFFFFF', { opacity });
}

/** The recurring brand-thread accent -- an LED/indicator dot. Use sparingly:
 *  only on products with a genuine indicator light (speaker, smartwatch,
 *  charging dock, power bank). Everywhere else it reads as a defect pixel. */
function signalDot(cx, cy, r, color) {
  return group([
    circle(cx, cy, r * 1.8, color, { opacity: 0.18 }),
    circle(cx, cy, r, color),
    circle(cx - r * 0.3, cy - r * 0.3, r * 0.35, '#FFFFFF', { opacity: 0.7 }),
  ].join(''));
}

function groundShadowMarkup(defs, cx, cy, rx, ry, opacity) {
  const fid = nid('blur');
  defs.push(`<filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>`);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${T.ink900}" opacity="${opacity}" filter="url(#${fid})"/>`;
}

// ---------------------------------------------------------------------------
// Uniform optical sizing. Every product declares the true bounding box of
// what it drew (native coordinates); this maps that box onto a shared target
// so every product occupies the same visual weight in the frame, bottom-
// anchored on the shared ground line -- regardless of whether it's a
// keyboard or a candle.
// ---------------------------------------------------------------------------
const TARGET_MAX = 490; // ~61% of the 800 canvas in the longest dimension
const STAGE_CX = 400;
const GROUND_Y = 630;

function fitToStage(inner, bbox) {
  const scale = TARGET_MAX / Math.max(bbox.w, bbox.h);
  const bboxCx = bbox.x + bbox.w / 2;
  const bboxBottom = bbox.y + bbox.h;
  const tx = STAGE_CX - bboxCx * scale;
  const ty = GROUND_Y - bboxBottom * scale;
  return {
    markup: `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${inner}</g>`,
    scaledW: bbox.w * scale,
    scaledH: bbox.h * scale,
  };
}

// ---------------------------------------------------------------------------
// Full-document assembly for a square product image
// ---------------------------------------------------------------------------
function renderProduct({ bgBase, bgGlow, draw, bbox }) {
  const defs = [];
  const glowId = nid('glow');
  defs.push(radialGrad(glowId, [
    [0, bgGlow, 0.95], [0.5, bgGlow, 0.55], [1, bgGlow, 0],
  ], { cx: 0.42, cy: 0.34, r: 0.8 }));

  const { markup, scaledW } = fitToStage(draw(defs), bbox);
  const shadowRx = Math.max(85, Math.min(230, scaledW * 0.5));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs>${defs.join('')}</defs>
<rect width="800" height="800" fill="${bgBase}"/>
<rect width="800" height="800" fill="url(#${glowId})"/>
${groundShadowMarkup(defs, 400, GROUND_Y + 20, shadowRx, 24, 0.16)}
${markup}
</svg>`;
  return svg;
}

/** QA-only: renders the same product at the same scale/position, but every
 *  shape forced to solid black on white -- so silhouette legibility can be
 *  judged directly. Not part of the shipped catalog. */
function renderProductSilhouette({ draw, bbox }) {
  SILHOUETTE = true;
  const defs = [];
  const { markup } = fitToStage(draw(defs), bbox);
  SILHOUETTE = false;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<rect width="800" height="800" fill="#FFFFFF"/>
${markup}
</svg>`;
}

function renderHero({ bgBase, bgGlow, draw }) {
  const defs = [];
  const glowId = nid('hglow');
  defs.push(radialGrad(glowId, [
    [0, bgGlow, 0.95], [0.5, bgGlow, 0.5], [1, bgGlow, 0],
  ], { cx: 0.26, cy: 0.36, r: 0.9 }));
  const body = draw(defs);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<defs>${defs.join('')}</defs>
<rect width="1600" height="900" fill="${bgBase}"/>
<rect width="1600" height="900" fill="url(#${glowId})"/>
${body}
</svg>`;
  return svg;
}

function renderLogo({ mark }) {
  const defs = [];
  const body = mark(defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
<defs>${defs.join('')}</defs>
${body}
</svg>`;
}

module.exports = {
  T, mix, nid, isSilhouette, defs: { linearGrad, radialGrad }, shapes: {
    rect, ellipse, circle, path: path_, line, group, cylinderV, capsuleH, sphere, box, glint, signalDot, rim,
  },
  render: { renderProduct, renderProductSilhouette, renderHero, renderLogo },
  dirs: { PRODUCTS_DIR, HERO_DIR, LOGO_DIR },
};
