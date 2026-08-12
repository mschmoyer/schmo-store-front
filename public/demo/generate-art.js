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
 *
 * Regenerating overwrites everything under public/demo/products, public/demo/hero
 * and public/demo/logo. The output is deterministic (no Math.random with a
 * volatile seed), so a re-run produces byte-identical files.
 *
 * Layout conventions (all product SVGs, 800x800 viewBox):
 *   - Ground line sits at y=630. Every product's contact shadow is centered there.
 *   - Key light comes from the top-left (gradients run 0,0 -> 1,1 light-to-dark).
 *   - Stroke weight is a constant 3px hairline at 14% ink-900 opacity (or a
 *     4% paper rim-light on very dark fills) -- never mixed within one piece.
 *   - Every product carries exactly one small "signal" accent (an LED dot, a
 *     wax seal, a stitched tab) using the store's ember/mint/amber token --
 *     the recurring brand thread across the whole catalog.
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

// ---------------------------------------------------------------------------
// Tiny SVG builder -- every draw() call returns { defs, body } fragments that
// renderProduct() assembles into a full document.
// ---------------------------------------------------------------------------
let uid = 0;
const nid = (p) => `${p}${uid++}`;

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

/** Blend two hex tokens from the design system to derive an in-palette mid-tone. */
function mix(hexA, hexB, t) {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  const ar = parseInt(a.slice(0, 2), 16), ag = parseInt(a.slice(2, 4), 16), ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16), bg = parseInt(b.slice(2, 4), 16), bb = parseInt(b.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function attrs(opts) {
  const a = [];
  if (opts.stroke) a.push(`stroke="${opts.stroke}"`);
  if (opts.strokeWidth) a.push(`stroke-width="${opts.strokeWidth}"`);
  if (opts.strokeOpacity != null) a.push(`stroke-opacity="${opts.strokeOpacity}"`);
  if (opts.strokeLinecap) a.push(`stroke-linecap="${opts.strokeLinecap}"`);
  if (opts.strokeDasharray) a.push(`stroke-dasharray="${opts.strokeDasharray}"`);
  if (opts.opacity != null) a.push(`opacity="${opts.opacity}"`);
  if (opts.transform) a.push(`transform="${opts.transform}"`);
  return a.length ? ' ' + a.join(' ') : '';
}

const rect = (x, y, w, h, rx, fill, opts = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${attrs(opts)}/>`;

const ellipse = (cx, cy, rx, ry, fill, opts = {}) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${attrs(opts)}/>`;

const circle = (cx, cy, r, fill, opts = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${attrs(opts)}/>`;

const path_ = (d, fill, opts = {}) => `<path d="${d}" fill="${fill}"${attrs(opts)}/>`;

const line = (x1, y1, x2, y2, stroke, w, opts = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"${attrs(opts)}/>`;

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

/** The one recurring brand-thread accent: a small signal dot. */
function signalDot(cx, cy, r, color) {
  return group([
    circle(cx, cy, r * 1.8, color, { opacity: 0.18 }),
    circle(cx, cy, r, color),
    circle(cx - r * 0.3, cy - r * 0.3, r * 0.35, '#FFFFFF', { opacity: 0.7 }),
  ].join(''));
}

function groundShadow(defs, cx, cy, rx, ry, opacity = 0.15) {
  const fid = nid('blur');
  defs.push(`<filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>`);
  return ellipse(cx, cy, rx, ry, T.ink900, { opacity, transform: undefined }).replace(
    '/>',
    ` filter="url(#${fid})"/>`
  );
}

// ---------------------------------------------------------------------------
// Full-document assembly for a square product image
// ---------------------------------------------------------------------------
function renderProduct({ washTint, draw }) {
  const defs = [];
  const bgWashId = nid('wash');
  const vignetteId = nid('vig');
  defs.push(radialGrad(bgWashId, [
    [0, T.paperRaised, 1], [0.55, T.paper, 1], [1, washTint, 1],
  ], { cx: 0.32, cy: 0.26, r: 0.95 }));
  defs.push(radialGrad(vignetteId, [
    [0, T.ink900, 0], [1, T.ink900, 0.06],
  ], { cx: 0.5, cy: 0.55, r: 0.75 }));

  const groundY = 630;
  const bodyParts = draw(defs);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs>${defs.join('')}</defs>
<rect width="800" height="800" fill="${T.paper}"/>
<rect width="800" height="800" fill="url(#${bgWashId})"/>
${groundShadow(defs, 400, groundY + 24, 210, 26, 0.13)}
${bodyParts}
<rect width="800" height="800" fill="url(#${vignetteId})"/>
</svg>`;
  return svg;
}

function renderHero({ washTint, draw }) {
  const defs = [];
  const bgWashId = nid('hwash');
  defs.push(radialGrad(bgWashId, [
    [0, T.paperRaised, 1], [0.5, T.paper, 1], [1, washTint, 1],
  ], { cx: 0.24, cy: 0.32, r: 1.05 }));
  const body = draw(defs);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<defs>${defs.join('')}</defs>
<rect width="1600" height="900" fill="${T.paper}"/>
<rect width="1600" height="900" fill="url(#${bgWashId})"/>
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
  T, mix, nid, defs: { linearGrad, radialGrad }, shapes: {
    rect, ellipse, circle, path: path_, line, group, cylinderV, capsuleH, sphere, box, glint, signalDot, groundShadow, rim,
  },
  render: { renderProduct, renderHero, renderLogo },
  dirs: { PRODUCTS_DIR, HERO_DIR, LOGO_DIR },
};
