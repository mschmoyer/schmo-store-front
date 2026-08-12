#!/usr/bin/env node
/**
 * RebelShops identity — asset generator.
 *
 * Everything in public/brand/ is authored here. No typeface is referenced by
 * name in any committed SVG: the wordmark is drawn from the parametric
 * letterform system below, so it renders identically everywhere. Rasters are
 * produced with sharp, which is already a project dependency.
 *
 *   node public/brand/generate.js
 *
 * Outputs
 *   public/brand/mark.svg | mark-mono.svg | mark-inverse.svg
 *   public/brand/wordmark.svg | wordmark-inverse.svg
 *   public/brand/logo-horizontal.svg | logo-horizontal-inverse.svg
 *   public/brand/logo-stacked.svg | logo-stacked-inverse.svg
 *   public/brand/icon-512.png | icon-192.png | apple-touch-icon.png
 *   public/brand/og-image.png
 *   public/favicon.ico | public/icon.svg | public/apple-icon.png | public/logo.png
 *
 * The OG poster is composed once as SVG and rendered by Chromium (Playwright,
 * a devDependency) so the supporting copy can use the Geist face already
 * vendored inside the `next` package. With no browser available it falls back
 * to sharp, which resolves the same text against a system grotesque. Either
 * way the result is a flat PNG with no external references.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const BRAND = path.join(ROOT, 'public', 'brand');
const PUBLIC = path.join(ROOT, 'public');

/* ========================================================================== */
/* 1. Palette — design-system.md §2                                            */
/* ========================================================================== */

const C = {
  ink950: '#08090B',
  ink900: '#0E1014',
  ink800: '#171A20',
  ink700: '#22262F',
  ink500: '#5A626F',
  ink400: '#858D9A',
  paper: '#FBFAF8',
  ember: '#F94E1B',
  ember400: '#FF6F3D',
  mint: '#0FA871',
};

/* ========================================================================== */
/* 2. Letterforms                                                              */
/* ========================================================================== */
/**
 * One metric system for the mark and the wordmark, so the monogram is
 * literally the R that opens the word and the two can never drift in weight.
 *
 * Units: cap height 100. Cap line y = 0, baseline y = 100, y grows downward.
 * Glyphs are stroked skeletons at weight STEM with butt caps and mitre joins.
 * Round letters are flat-sided — a straight vertical at the extremes with
 * elliptical corners — which is what keeps them in the same family as the R's
 * 45-degree cut corners.
 */

const M = {
  cap: 100,
  xh: 28,        // y of the x-height line (x-height = 72)
  asc: -4,       // ascender line
  desc: 126,     // descender line
  over: 1.5,     // round-letter overshoot
  round: 70,     // outer width of o / e / b / p / h
  flat: 7,       // half-length of the straight side on round letters
  track: 9,      // gap between glyph outer edges
};

/** Stem weight as a fraction of cap height. 19.4% — a bold grotesque. */
const STEM = 19.4;

/** The R. Also, at a different scale, the entire mark. */
const R_SPEC = {
  bowlBot: 61,   // outer bottom of the bowl
  right: 85,     // outer right of the bowl
  ch: 13,        // 45-degree cut on the bowl's right corners
  legFrom: 24,   // x where the flap's top edge leaves the bowl
  legFoot: 60,   // x where the flap's left edge lands on the baseline
  legW: 26,      // horizontal width of the flap
};

const num = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** A pen that bakes scale and origin into the emitted numbers, so no shipped
 *  SVG needs a transform attribute. */
function Pen(k, ox, oy) {
  let d = '';
  const X = (v) => num(ox + v * k);
  const Y = (v) => num(oy + v * k);
  const R = (v) => num(v * k);
  const api = {
    M: (x, y) => ((d += `M${X(x)} ${Y(y)}`), api),
    L: (x, y) => ((d += `L${X(x)} ${Y(y)}`), api),
    H: (x) => ((d += `H${X(x)}`), api),
    V: (y) => ((d += `V${Y(y)}`), api),
    A: (rx, ry, laf, sf, x, y) => ((d += `A${R(rx)} ${R(ry)} 0 ${laf} ${sf} ${X(x)} ${Y(y)}`), api),
    C: (x1, y1, x2, y2, x, y) =>
      ((d += `C${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(x)} ${Y(y)}`), api),
    Z: () => ((d += 'Z'), api),
    out: () => d,
  };
  return api;
}

const S = STEM;
const h = S / 2;

/** Flat-sided ring metrics, shared by o and e. */
function ring() {
  const cx = M.round / 2;
  const top = M.xh - M.over;
  const bot = M.cap + M.over;
  return {
    cx,
    cy: (top + bot) / 2,
    rx: cx - h,
    ry: (bot - top) / 2 - h,
    f: M.flat,
    cry: (bot - top) / 2 - h - M.flat,
  };
}

const GLYPHS = {
  R: () => {
    const { bowlBot, right, ch, legFrom, legFoot, legW } = R_SPEC;
    const rx = right - h;
    const fl = rx - ch;
    return {
      w: legFoot + legW,
      strokes: [
        (p) => p.M(h, 0).V(M.cap),
        (p) =>
          p.M(h, h).H(fl).L(rx, h + ch).V(bowlBot - h - ch).L(fl, bowlBot - h).H(h),
      ],
      flap: (p) =>
        p.M(legFrom, bowlBot).H(legFrom + legW).L(legFoot + legW, M.cap).H(legFoot).Z(),
    };
  },

  S: () => {
    const w = 79;
    const L = h, Rr = w - h, T = h, B = M.cap - h, mid = 50;
    return {
      w,
      strokes: [
        (p) =>
          p
            .M(Rr, T + 21)
            .C(Rr, T + 8, Rr - 13, T, w / 2 - 2, T)
            .C(L + 13, T, L, T + 8, L, T + 21)
            .C(L, T + 33, L + 12, mid - 2, w / 2 + 1, mid + 2)
            .C(Rr - 11, mid + 6, Rr, B - 32, Rr, B - 20)
            .C(Rr, B - 8, Rr - 13, B, w / 2 - 3, B)
            .C(L + 12, B, L, B - 8, L, B - 21),
      ],
    };
  },

  o: () => {
    const { cx, cy, rx, f, cry } = ring();
    return {
      w: M.round,
      strokes: [
        (p) =>
          p
            .M(cx - rx, cy - f)
            .A(rx, cry, 0, 1, cx + rx, cy - f)
            .V(cy + f)
            .A(rx, cry, 0, 1, cx - rx, cy + f)
            .Z(),
      ],
    };
  },

  e: () => {
    const { cx, cy, rx, f, cry } = ring();
    const barY = cy - 5;
    const a = (46 * Math.PI) / 180;
    const tx = cx + rx * Math.cos(a);
    const ty = cy + f + cry * Math.sin(a);
    return {
      w: M.round,
      strokes: [
        (p) =>
          p
            .M(tx, ty)
            .A(rx, cry, 0, 1, cx - rx, cy + f)
            .V(cy - f)
            .A(rx, cry, 0, 1, cx + rx, cy - f)
            .V(barY),
        (p) => p.M(cx - rx, barY).H(cx + rx),
      ],
    };
  },

  b: () => ({ w: M.round, strokes: [(p) => p.M(h, M.asc).V(M.cap), bowl] }),
  p: () => ({ w: M.round, strokes: [(p) => p.M(h, M.xh).V(M.desc), bowl] }),

  l: () => ({ w: S, strokes: [(p) => p.M(h, M.asc).V(M.cap)] }),

  h: () => {
    const springY = 57;
    const rx = (M.round - S) / 2;
    const ry = springY - (M.xh - M.over + h);
    return {
      w: M.round,
      strokes: [
        (p) => p.M(h, M.asc).V(M.cap),
        (p) => p.M(h, springY).A(rx, ry, 0, 1, M.round - h, springY).V(M.cap),
      ],
    };
  },

  s: () => {
    const w = 63;
    const L = h, Rr = w - h;
    const T = M.xh - M.over + h, B = M.cap + M.over - h;
    const mid = (T + B) / 2;
    return {
      w,
      strokes: [
        (p) =>
          p
            .M(Rr, T + 15)
            .C(Rr, T + 5, Rr - 10, T, w / 2 - 1, T)
            .C(L + 10, T, L, T + 6, L, T + 15)
            .C(L, T + 24, L + 9, mid - 2, w / 2 + 1, mid + 2)
            .C(Rr - 8, mid + 6, Rr, B - 23, Rr, B - 14)
            .C(Rr, B - 5, Rr - 10, B, w / 2 - 2, B)
            .C(L + 9, B, L, B - 5, L, B - 15),
      ],
    };
  },
};

/** b and p share this bowl. */
function bowl(p) {
  const top = M.xh - M.over + h;
  const bot = M.cap + M.over - h;
  const cy = (top + bot) / 2;
  const ry = (bot - top) / 2;
  const right = M.round - h;
  const crx = ry;
  const cry = ry - M.flat;
  return p
    .M(h, top)
    .H(right - crx)
    .A(crx, cry, 0, 1, right, cy - M.flat)
    .V(cy + M.flat)
    .A(crx, cry, 0, 1, right - crx, bot)
    .H(h);
}

/** Pair kerning, in cap units. Negative pulls a pair together. */
const KERN = { Re: -3, eb: -1, be: -1, el: -1, lS: 2, Sh: -1, ho: -2, op: -1, ps: -2 };

/** Advance width of a string, in cap units. */
function measure(str, track = M.track) {
  let x = 0;
  for (let i = 0; i < str.length; i++) {
    x += GLYPHS[str[i]]().w + track + (KERN[str.slice(i, i + 2)] || 0);
  }
  return x - track;
}

/**
 * Lay a string out at scale k with its cap-line origin at (ox, oy).
 * Returns { strokes:[d], flaps:[d], width, stroke } already in output units.
 */
function setText(str, { k = 1, ox = 0, oy = 0, track = M.track } = {}) {
  const strokes = [];
  const flaps = [];
  let x = 0;
  for (let i = 0; i < str.length; i++) {
    const g = GLYPHS[str[i]]();
    const at = ox + x * k;
    for (const draw of g.strokes) strokes.push(draw(Pen(k, at, oy)).out());
    if (g.flap) flaps.push(g.flap(Pen(k, at, oy)).out());
    x += g.w + track + (KERN[str.slice(i, i + 2)] || 0);
  }
  return { strokes, flaps, width: (x - track) * k, stroke: num(S * k) };
}

/* ========================================================================== */
/* 3. SVG assembly                                                             */
/* ========================================================================== */

const WORD = 'RebelShops';
const WORD_W = measure(WORD);            // 748.4 cap units
const R_W = GLYPHS.R().w;                // 86 cap units

/** Wrap a body in a tidy, self-describing SVG document. */
function svg({ id, viewBox, width, height, title, body, style = '' }) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"` +
    (width ? ` width="${width}" height="${height}"` : '') +
    ` role="img" aria-labelledby="${id}-title">` +
    `<title id="${id}-title">${title}</title>` +
    style +
    body +
    `</svg>\n`
  );
}

/** Paths for one laid-out string. */
function paint(set, { fg, accent }) {
  return (
    set.strokes
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="${fg}" stroke-width="${set.stroke}" stroke-linejoin="miter" stroke-linecap="butt"/>`
      )
      .join('') + set.flaps.map((d) => `<path d="${d}" fill="${accent}"/>`).join('')
  );
}

/* ---- the mark ----------------------------------------------------------- */
/* Square viewBox in cap units: the R is 86 x 100, centred in 120 x 120 with
   17 units of side air and 10 of top/bottom air. No transform required. */
const MARK_BOX = 120;
const MARK_X = -(MARK_BOX - R_W) / 2;   // -17
const MARK_Y = -(MARK_BOX - M.cap) / 2; // -10
const MARK_VB = `${MARK_X} ${MARK_Y} ${MARK_BOX} ${MARK_BOX}`;

function markBody({ fg, accent }) {
  return paint(setText('R'), { fg, accent });
}

function markSvg(id, title, colors) {
  return svg({ id, viewBox: MARK_VB, title, body: markBody(colors) });
}

/* ---- the tile (favicon / app icon): mark reversed out of an ember square -- */
function tileBody({ radius, ground, fg, scale }) {
  const k = scale;
  const w = R_W * k;
  const set = setText('R', { k, ox: (MARK_BOX - w) / 2, oy: (MARK_BOX - M.cap * k) / 2 });
  const bg =
    radius > 0
      ? `<rect x="0" y="0" width="${MARK_BOX}" height="${MARK_BOX}" rx="${radius}" fill="${ground}"/>`
      : `<rect x="0" y="0" width="${MARK_BOX}" height="${MARK_BOX}" fill="${ground}"/>`;
  return bg + paint(set, { fg, accent: fg });
}

function tileSvg(id, { radius = 27, ground = C.ember, fg = C.paper, scale = 0.72 } = {}) {
  return svg({
    id,
    viewBox: `0 0 ${MARK_BOX} ${MARK_BOX}`,
    title: 'RebelShops',
    body: tileBody({ radius, ground, fg, scale }),
  });
}

/* ---- the wordmark ------------------------------------------------------- */
const WORD_PAD = 3;
function wordmarkSvg(id, fg) {
  const set = setText(WORD);
  const top = M.asc - WORD_PAD;
  const height = M.desc + WORD_PAD - top;
  return svg({
    id,
    viewBox: `${-WORD_PAD} ${top} ${num(WORD_W + WORD_PAD * 2)} ${num(height)}`,
    title: 'RebelShops',
    body: paint(set, { fg, accent: fg }),
  });
}

/* ---- lockups ------------------------------------------------------------ */
/* The mark stands 1.32x the wordmark's cap height and sits on the same optical
   centre line. The gap between them is 0.42 cap heights. */
const LOCK = { markScale: 1.32, gap: 42 };

function horizontalSvg(id, { fg, accent }) {
  const mk = LOCK.markScale;
  const markH = M.cap * mk;
  const markW = R_W * mk;
  const wordTop = (markH - M.cap) / 2;             // cap-line of the word
  const markSet = setText('R', { k: mk, ox: 0, oy: 0 });
  const wordSet = setText(WORD, { k: 1, ox: markW + LOCK.gap, oy: wordTop });
  const bottom = Math.max(markH, wordTop + M.desc);
  const top = 0;
  const width = markW + LOCK.gap + WORD_W;
  return svg({
    id,
    viewBox: `${-WORD_PAD} ${top - WORD_PAD} ${num(width + WORD_PAD * 2)} ${num(bottom - top + WORD_PAD * 2)}`,
    title: 'RebelShops',
    body: paint(markSet, { fg, accent }) + paint(wordSet, { fg, accent: fg }),
  });
}

function stackedSvg(id, { fg, accent }) {
  const mk = 2.7;
  const markW = R_W * mk;
  const markH = M.cap * mk;
  const gap = 48;
  const width = Math.max(markW, WORD_W);
  const markSet = setText('R', { k: mk, ox: (width - markW) / 2, oy: 0 });
  const wordSet = setText(WORD, { k: 1, ox: (width - WORD_W) / 2, oy: markH + gap });
  const bottom = markH + gap + M.cap;
  return svg({
    id,
    viewBox: `${-WORD_PAD} ${-WORD_PAD} ${num(width + WORD_PAD * 2)} ${num(bottom + WORD_PAD * 2)}`,
    title: 'RebelShops',
    body: paint(markSet, { fg, accent }) + paint(wordSet, { fg, accent: fg }),
  });
}

/* ---- the theme-aware SVG favicon ---------------------------------------- */
function iconSvg() {
  const body = markBody({ fg: 'var(--rs-fg)', accent: C.ember });
  const style =
    `<style>:root{--rs-fg:${C.ink900}}` +
    `@media (prefers-color-scheme:dark){:root{--rs-fg:${C.paper}}}</style>`;
  return svg({
    id: 'rs-icon',
    viewBox: MARK_VB,
    title: 'RebelShops',
    style,
    body,
  });
}

/* ========================================================================== */
/* 4. The OG poster                                                            */
/* ========================================================================== */

const OG = { w: 1200, height: 630 };

/**
 * Composed once, rendered twice. Text uses a font stack rather than a single
 * family so the sharp fallback still lands on a grotesque.
 */
function ogSvg() {
  const pad = 82;
  const sans = 'Geist, Inter, &quot;Liberation Sans&quot;, Arial, Helvetica, sans-serif';
  const mono = '&quot;Geist Mono&quot;, &quot;JetBrains Mono&quot;, &quot;Liberation Mono&quot;, monospace';

  /* lockup, top-left, mark 62 tall */
  const mk = 62 / M.cap;
  const markSet = setText('R', { k: mk, ox: pad, oy: pad });
  const wordK = 34 / M.cap;
  const wordSet = setText(WORD, {
    k: wordK,
    ox: pad + R_W * mk + 22,
    oy: pad + (62 - 34) / 2,
  });

  /* a ghost R bleeding off the lower right — quiet, structural, not decoration */
  const gk = 520 / M.cap;
  const ghost = setText('R', { k: gk, ox: 792, oy: 176 });

  const heroY = 300;
  const line = 82;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.w}" height="${OG.height}" viewBox="0 0 ${OG.w} ${OG.height}" role="img" aria-labelledby="og-title">
<title id="og-title">RebelShops — your ShipStation catalog, now a storefront</title>
<rect width="${OG.w}" height="${OG.height}" fill="${C.ink950}"/>
<g opacity="0.5">${paint(ghost, { fg: C.ink800, accent: C.ink700 })}</g>
<rect x="0" y="0" width="${OG.w}" height="6" fill="${C.ember}"/>
${paint(markSet, { fg: C.paper, accent: C.ember })}
${paint(wordSet, { fg: C.paper, accent: C.paper })}
<text x="${pad}" y="222" font-family="${mono}" font-size="17" font-weight="500" letter-spacing="2.6" fill="${C.ember400}">FOR SHIPSTATION SELLERS</text>
<text x="${pad}" y="${heroY}" font-family="${sans}" font-size="66" font-weight="650" letter-spacing="-2.2" fill="${C.paper}">Your ShipStation catalog,</text>
<text x="${pad}" y="${heroY + line}" font-family="${sans}" font-size="66" font-weight="650" letter-spacing="-2.2" fill="${C.paper}">now a storefront.</text>
<rect x="${pad}" y="452" width="256" height="58" rx="10" fill="${C.ember}"/>
<text x="${pad + 128}" y="490" text-anchor="middle" font-family="${sans}" font-size="25" font-weight="650" letter-spacing="-0.4" fill="${C.ink950}">$1 for 3 months</text>
<text x="${pad + 280}" y="482" font-family="${sans}" font-size="21" font-weight="450" fill="${C.ink400}">then $19.99/mo.</text>
<text x="${pad + 280}" y="507" font-family="${sans}" font-size="21" font-weight="450" fill="${C.ink400}">We never take a cut of a sale.</text>
<rect x="0" y="${OG.height - 1}" width="${OG.w}" height="1" fill="${C.ink800}"/>
</svg>`;
}

/* ========================================================================== */
/* 5. Rasterising                                                              */
/* ========================================================================== */

const DENSITY = 1200;

async function png(svgString, size, out, { height } = {}) {
  await sharp(Buffer.from(svgString), { density: DENSITY })
    .resize(size, height || size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

/** Multi-size ICO with PNG payloads (16 / 32 / 48). */
async function ico(svgString, sizes, out) {
  const images = [];
  for (const size of sizes) {
    images.push({
      size,
      data: await sharp(Buffer.from(svgString), { density: DENSITY })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer(),
    });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const o = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, o);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(img.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.data.length;
  });

  fs.writeFileSync(out, Buffer.concat([header, dir, ...images.map((i) => i.data)]));
  return out;
}

/** Render the poster in Chromium so the copy can use the vendored Geist. */
async function ogViaChromium(svgString, out) {
  let chromium;
  try {
    ({ chromium } = require('@playwright/test'));
  } catch {
    return false;
  }
  const fontDir = path.join(
    ROOT,
    'node_modules/next/dist/client/components/react-dev-overlay/font'
  );
  const faces = [
    ['Geist', 'geist-latin.woff2'],
    ['Geist Mono', 'geist-mono-latin.woff2'],
  ]
    .filter(([, f]) => fs.existsSync(path.join(fontDir, f)))
    .map(
      ([family, f]) =>
        `@font-face{font-family:"${family}";font-weight:100 900;font-display:block;` +
        `src:url("data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, f)).toString('base64')}") format("woff2")}`
    )
    .join('');

  const html = `<!doctype html><meta charset="utf-8"><style>${faces}
    html,body{margin:0;padding:0;background:${C.ink950}}
    svg{display:block}</style>${svgString}`;

  const launch = { args: ['--no-sandbox', '--font-render-hinting=none'] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

  let browser;
  try {
    browser = await chromium.launch(launch);
  } catch {
    return false;
  }
  try {
    const page = await browser.newPage({
      viewport: { width: OG.w, height: OG.height },
      deviceScaleFactor: 2,
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: OG.w, height: OG.height } });
    await sharp(shot).resize(OG.w, OG.height).png({ compressionLevel: 9 }).toFile(out);
    return true;
  } finally {
    await browser.close();
  }
}

/* ========================================================================== */
/* 6. Write everything                                                         */
/* ========================================================================== */

async function main() {
  fs.mkdirSync(BRAND, { recursive: true });
  const written = [];
  const put = (dir, name, contents) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, contents);
    written.push(path.relative(ROOT, p));
  };

  /* --- SVG --- */
  put(BRAND, 'mark.svg', markSvg('rs-mark', 'RebelShops', { fg: C.ink900, accent: C.ember }));
  put(
    BRAND,
    'mark-inverse.svg',
    markSvg('rs-mark-inv', 'RebelShops', { fg: C.paper, accent: C.ember })
  );
  put(
    BRAND,
    'mark-mono.svg',
    markSvg('rs-mark-mono', 'RebelShops', { fg: 'currentColor', accent: 'currentColor' })
  );

  put(BRAND, 'wordmark.svg', wordmarkSvg('rs-word', C.ink900));
  put(BRAND, 'wordmark-inverse.svg', wordmarkSvg('rs-word-inv', C.paper));

  put(
    BRAND,
    'logo-horizontal.svg',
    horizontalSvg('rs-lh', { fg: C.ink900, accent: C.ember })
  );
  put(
    BRAND,
    'logo-horizontal-inverse.svg',
    horizontalSvg('rs-lh-inv', { fg: C.paper, accent: C.ember })
  );
  put(BRAND, 'logo-stacked.svg', stackedSvg('rs-ls', { fg: C.ink900, accent: C.ember }));
  put(
    BRAND,
    'logo-stacked-inverse.svg',
    stackedSvg('rs-ls-inv', { fg: C.paper, accent: C.ember })
  );

  put(PUBLIC, 'icon.svg', iconSvg());

  /* --- raster --- */
  const tileRounded = tileSvg('rs-tile');
  const tileSquare = tileSvg('rs-tile-sq', { radius: 0 });

  await png(tileRounded, 512, path.join(BRAND, 'icon-512.png'));
  await png(tileRounded, 192, path.join(BRAND, 'icon-192.png'));
  await png(tileSquare, 180, path.join(BRAND, 'apple-touch-icon.png'));
  await png(tileSquare, 180, path.join(PUBLIC, 'apple-icon.png'));
  written.push(
    'public/brand/icon-512.png',
    'public/brand/icon-192.png',
    'public/brand/apple-touch-icon.png',
    'public/apple-icon.png'
  );

  await ico(tileRounded, [16, 32, 48], path.join(PUBLIC, 'favicon.ico'));
  written.push('public/favicon.ico');

  /* logo.png — horizontal lockup, ink, transparent ground, 1200 wide */
  const lh = horizontalSvg('rs-lh', { fg: C.ink900, accent: C.ember });
  const lhMeta = await sharp(Buffer.from(lh), { density: DENSITY }).metadata();
  await png(lh, 1200, path.join(PUBLIC, 'logo.png'), {
    height: Math.round((1200 * lhMeta.height) / lhMeta.width),
  });
  written.push('public/logo.png');

  /* --- the poster --- */
  const poster = ogSvg();
  const ogPath = path.join(BRAND, 'og-image.png');
  const viaBrowser = await ogViaChromium(poster, ogPath);
  if (!viaBrowser) {
    await sharp(Buffer.from(poster), { density: 96 })
      .resize(OG.w, OG.height)
      .png({ compressionLevel: 9 })
      .toFile(ogPath);
  }
  written.push(`public/brand/og-image.png${viaBrowser ? '' : '  (sharp fallback — system grotesque)'}`);

  console.log(written.map((w) => `  ${w}`).join('\n'));
  console.log(`\n${written.length} files. wordmark advance ${num(WORD_W)} cap units.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  C, M, STEM, R_SPEC, GLYPHS, KERN, measure, setText, paint, svg,
  markSvg, tileSvg, wordmarkSvg, horizontalSvg, stackedSvg, iconSvg, ogSvg,
  MARK_VB, WORD, WORD_W, R_W,
};
