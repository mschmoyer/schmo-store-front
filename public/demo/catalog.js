#!/usr/bin/env node
/**
 * Product/hero/logo illustration catalog for the three RebelShops demo stores.
 * Pure data + draw functions -- run `node build.js` to render everything.
 *
 * Every product declares `bbox` (its true drawn extent in native coordinates)
 * alongside `draw()`. `fitToStage()` in generate-art.js uses that to give
 * every product the same optical weight in the frame -- see that file's
 * header for the exact rule. Get the bbox close, not pixel-perfect; the
 * contact sheet is the real check.
 *
 * Each store's palette is derived entirely from docs/design-system.md tokens
 * via generate-art.js's `mix()` helper -- no invented hexes.
 */
const { T, mix, nid, defs: gdefs, shapes, render, dirs } = require('./generate-art.js');
const { rect, ellipse, circle, path: pth, line, group, cylinderV, capsuleH, sphere, box, glint, signalDot, rim } = shapes;
const { linearGrad, radialGrad } = gdefs;

const rimless = { strokeOpacity: 0 };

// ===========================================================================
// STORE A -- Basecamp Audio (electronics). Cool graphite body, ember signal
// reserved for the four products that have a real indicator light in life.
// ===========================================================================
const eLight = T.ink400, eMid = T.ink600, eDark = T.ink900, eAccent = T.ember500;
const eBgBase = mix(T.ink200, T.ink400, 0.55); // cool slate -- "graphite"
const eBgGlow = T.paperRaised;

const electronics = [
  {
    slug: 'aviator-headphones-onyx',
    bbox: { x: 192, y: 190, w: 416, h: 340 },
    draw(defs) {
      let s = '';
      const cupL = { x: 288, y: 432 }, cupR = { x: 512, y: 432 };
      const bandId = nid('band');
      defs.push(linearGrad(bandId, [[0, eLight], [1, eMid]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      s += pth(`M ${cupL.x} ${cupL.y - 6} C ${cupL.x - 44} 224 ${cupR.x + 44} 224 ${cupR.x} ${cupR.y - 6}`,
        'none', { stroke: `url(#${bandId})`, strokeWidth: 44, strokeLinecap: 'round' });
      s += pth(`M ${cupL.x} ${cupL.y - 14} C ${cupL.x - 40} 210 ${cupR.x + 40} 210 ${cupR.x} ${cupR.y - 14}`,
        'none', { stroke: '#FFFFFF', strokeWidth: 4, strokeLinecap: 'round', strokeOpacity: 0.22 });
      for (const cup of [cupL, cupR]) {
        s += sphere(defs, cup.x, cup.y, 96, eLight, eDark);
        s += ellipse(cup.x, cup.y, 56, 62, mix(eDark, '#000000', 0.2), { opacity: 0.92 });
        s += ellipse(cup.x, cup.y, 40, 46, mix(eDark, '#000000', 0.05), { opacity: 0.5 });
        s += glint(cup.x - 32, cup.y - 38, 20, 13, 0.3);
      }
      return s;
    },
  },
  {
    // Closed pebble case with a visible lid-parting seam and a press notch,
    // wells suggested through the lid, one bud resting loose beside it --
    // an unambiguous capsule, no hinge-arm risk.
    slug: 'pulse-earbuds-case',
    bbox: { x: 306, y: 355, w: 302, h: 228 },
    draw(defs) {
      let s = '';
      const cx = 400, topY = 450, w = 180, h = 130;
      s += box(defs, cx - w / 2, topY, w, h, 55, eLight, eDark); // case body (closed pebble)
      s += line(cx - w / 2 + 14, topY + 63, cx + w / 2 - 14, topY + 63, mix(eDark, '#000', 0.3), 2, { strokeOpacity: 0.4 }); // lid seam
      s += pth(`M ${cx - 16} ${topY} A 16 10 0 0 0 ${cx + 16} ${topY}`, mix(eLight, '#FFFFFF', 0.35)); // press notch
      s += ellipse(cx - 44, topY + 40, 24, 20, mix(eDark, '#000000', 0.3)); // well L (through lid)
      s += ellipse(cx + 44, topY + 40, 24, 20, mix(eDark, '#000000', 0.3)); // well R
      s += glint(cx - 40, topY + 22, 14, 8, 0.35);
      s += glint(cx - 20, topY - 6, 16, 8, 0.3);
      // loose earbud floating beside the case
      const bx = cx + 165, by = 400;
      s += sphere(defs, bx, by, 42, eLight, eMid);
      s += pth(`M ${bx + 18} ${by + 26} q 26 18 22 54`, 'none', { stroke: eMid, strokeWidth: 13, strokeLinecap: 'round' });
      s += glint(bx - 13, by - 14, 11, 7, 0.4);
      return s;
    },
  },
  {
    slug: 'keystroke-mechanical-keyboard',
    bbox: { x: 150, y: 380, w: 550, h: 220 },
    draw(defs) {
      let s = '';
      const bx = 150, by = 380, bw = 500, bh = 200;
      s += group(box(defs, bx, by, bw, bh, 22, eLight, eDark), { transform: 'skewY(-3)' });
      const cols = 12, rows = 4, pad = 10;
      const kw = (bw - pad * (cols + 1)) / cols, kh = (bh - 60 - pad * (rows + 1)) / rows;
      const keyId = nid('key');
      defs.push(linearGrad(keyId, [[0, mix(eLight, '#FFFFFF', 0.3)], [1, eLight]]));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const kx = bx + pad + c * (kw + pad) + 6;
          const ky = by + pad + r * (kh + pad) + 8 - r * 1.5;
          const accent = (r === 3 && c === 5);
          s += rect(kx, ky, kw, kh, 5, accent ? eAccent : `url(#${keyId})`, { opacity: accent ? 1 : 0.95 });
        }
      }
      s += pth(`M ${bx + bw - 40} ${by + bh - 10} q 40 30 90 20`, 'none', { stroke: eMid, strokeWidth: 8, strokeLinecap: 'round' });
      return s;
    },
  },
  {
    slug: 'basecamp-smart-speaker',
    bbox: { x: 290, y: 270, w: 220, h: 360 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 300, 600, 110, 30, eLight, eDark);
      for (const r of [92, 68, 44]) s += circle(400, 300, r, 'none', { stroke: mix(eDark, '#000000', 0.2), strokeWidth: 3, strokeOpacity: 0.5 });
      s += circle(400, 300, 20, mix(eDark, '#000000', 0.3));
      s += glint(360, 270, 26, 12, 0.25);
      s += signalDot(400, 560, 9, eAccent); // real: mic-mute status ring
      return s;
    },
  },
  {
    // Landscape body dominated by a large lens, sitting on a wide monitor
    // bezel with the clip's foot peeking out from directly behind it --
    // stacked and compact, not a lateral tail.
    slug: 'orbit-webcam-clip',
    bbox: { x: 253, y: 463, w: 294, h: 132 },
    draw(defs) {
      let s = '';
      s += rect(255, 562, 290, 24, 5, mix(eDark, '#000', 0.1), rim(true)); // monitor bezel slab
      s += rect(386, 538, 26, 46, 8, mix(eLight, eDark, 0.5)); // clip body, descending behind bezel
      s += rect(368, 578, 62, 14, 6, mix(eLight, eDark, 0.55), rim(false)); // clip foot, hooked under the front lip
      s += box(defs, 320, 466, 160, 82, 32, eLight, eDark); // webcam body (wide)
      s += sphere(defs, 400, 507, 48, eLight, eDark); // dominant lens
      s += circle(400, 507, 28, mix(eDark, '#000000', 0.45));
      s += circle(400, 507, 12, '#050608');
      s += glint(386, 492, 9, 6, 0.5);
      return s;
    },
  },
  {
    slug: 'voltpack-power-bank',
    bbox: { x: 320, y: 320, w: 230, h: 300 },
    draw(defs) {
      let s = '';
      s += box(defs, 320, 320, 160, 300, 28, eLight, eDark);
      s += rect(340, 350, 120, 6, 3, mix(eLight, '#FFFFFF', 0.4), { opacity: 0.5 });
      for (let i = 0; i < 4; i++) {
        const cy = 400 + i * 34;
        s += circle(400, cy, 8, i < 3 ? eAccent : mix(eDark, '#000', 0.3), { opacity: i < 3 ? 1 : 0.5 }); // real: charge-level LEDs
      }
      s += pth('M 480 560 q 60 10 70 60 q -50 -30 -84 -8', 'none', { stroke: eMid, strokeWidth: 10, strokeLinecap: 'round' });
      return s;
    },
  },
  {
    slug: 'arclight-desk-lamp',
    bbox: { x: 188, y: 253, w: 336, h: 372 },
    draw(defs) {
      let s = '';
      s += ellipse(400, 600, 120, 22, eDark, rim(true));
      s += rect(390, 480, 20, 130, 8, mix(eLight, eDark, 0.4));
      s += pth('M 400 480 L 320 340', 'none', { stroke: eMid, strokeWidth: 16, strokeLinecap: 'round' });
      s += pth('M 320 340 L 250 300', 'none', { stroke: eLight, strokeWidth: 16, strokeLinecap: 'round' });
      s += circle(320, 340, 14, eDark);
      s += circle(400, 480, 14, eDark);
      const shadeId = nid('shade');
      defs.push(linearGrad(shadeId, [[0, eLight], [1, eDark]]));
      s += pth('M 190 260 A 90 46 0 0 1 340 280 L 320 300 A 70 30 0 0 0 210 288 Z', `url(#${shadeId})`, rim(false));
      s += ellipse(255, 300, 68, 16, mix(eAccent, '#FFFFFF', 0.4), { opacity: 0.55 });
      return s;
    },
  },
  {
    // Portrait teardrop with a notch at the front (button split) -- distinct
    // silhouette from anchor-kettlebell's ball-on-a-flat-base.
    slug: 'glide-wireless-mouse',
    bbox: { x: 293, y: 328, w: 214, h: 254 },
    draw(defs) {
      let s = '';
      const id = nid('mouse');
      defs.push(radialGrad(id, [[0, eLight], [0.7, eDark], [1, eDark]], { cx: 0.32, cy: 0.22, r: 0.9 }));
      s += pth('M 388 330 Q 320 336 300 420 Q 294 502 342 556 Q 372 580 400 580 Q 428 580 458 556 Q 506 502 500 420 Q 480 336 412 330 Q 400 348 388 330 Z',
        `url(#${id})`, rim(false));
      s += line(400, 352, 400, 430, mix(eDark, '#000', 0.2), 3, { strokeOpacity: 0.5 }); // button split
      s += ellipse(400, 400, 9, 20, mix(eDark, '#000', 0.3)); // scroll wheel notch
      s += glint(350, 385, 24, 15, 0.28);
      return s;
    },
  },
  {
    slug: 'hubline-usb-c-hub',
    bbox: { x: 228, y: 398, w: 274, h: 144 },
    draw(defs) {
      let s = '';
      s += group(box(defs, 300, 400, 200, 90, 20, eLight, eDark), { transform: 'rotate(-4 400 445)' });
      for (let i = 0; i < 3; i++) {
        s += rect(330 + i * 50, 424, 30, 14, 4, mix(eDark, '#000', 0.3));
      }
      s += pth('M 300 460 q -60 20 -70 80', 'none', { stroke: eMid, strokeWidth: 12, strokeLinecap: 'round' });
      return s;
    },
  },
  {
    // Long tapered bands (wide at case, narrower at the tip) with a punched
    // vent hole -- the previous flared-at-the-tip taper was the "hourglass"
    // bug. A small heart-rate squiggle on the face reads as a live display.
    slug: 'pulse-smartwatch',
    bbox: { x: 316, y: 246, w: 168, h: 428 },
    draw(defs) {
      let s = '';
      const strapId = nid('strap');
      defs.push(linearGrad(strapId, [[0, mix(eDark, '#000000', 0.1)], [1, T.ink950]]));
      s += pth('M 362 360 L 438 360 L 432 262 Q 430 250 418 250 L 382 250 Q 370 250 368 262 Z', `url(#${strapId})`,
        { stroke: T.paperRaised, strokeWidth: 2, strokeOpacity: 0.14 });
      s += pth('M 362 440 L 438 440 L 432 538 Q 430 550 418 550 L 382 550 Q 370 550 368 538 Z', `url(#${strapId})`,
        { stroke: T.paperRaised, strokeWidth: 2, strokeOpacity: 0.14 });
      s += ellipse(400, 268, 9, 6, mix(T.ink950, '#000', 0.3)); // vent hole, top strap
      s += ellipse(400, 532, 9, 6, mix(T.ink950, '#000', 0.3)); // vent hole, bottom strap
      s += box(defs, 320, 360, 160, 160, 36, eLight, eDark); // case
      s += rect(340, 380, 120, 120, 22, mix(eDark, '#000', 0.35)); // screen
      s += pth('M 350 440 L 372 440 L 384 414 L 398 462 L 412 424 L 424 440 L 450 440', 'none',
        { stroke: eAccent, strokeWidth: 4, strokeLinecap: 'round', strokeOpacity: 0.9 }); // heart-rate line
      s += circle(468, 420, 9, eDark); // crown
      s += glint(358, 396, 26, 14, 0.16);
      s += signalDot(400, 405, 6, eAccent); // real: status LED at top of screen
      return s;
    },
  },
  {
    slug: 'driftcase-portable-ssd',
    bbox: { x: 280, y: 400, w: 240, h: 130 },
    draw(defs) {
      let s = '';
      s += group(box(defs, 280, 400, 240, 130, 22, eLight, eDark), { transform: 'skewY(-2)' });
      for (let i = 0; i < 3; i++) {
        s += line(300, 430 + i * 24, 500, 430 + i * 24, mix(eLight, '#FFFFFF', 0.3), 2, { strokeOpacity: 0.25 });
      }
      return s;
    },
  },
  {
    slug: 'anchor-charging-dock',
    bbox: { x: 298, y: 288, w: 204, h: 314 },
    draw(defs) {
      let s = '';
      s += pth('M 300 600 L 500 600 L 460 420 L 340 420 Z', mix(eLight, eDark, 0.55), rim(false));
      s += group(box(defs, 355, 300, 90, 170, 18, eLight, eDark), { transform: 'rotate(-8 400 460)' });
      s += group(rect(365, 314, 70, 142, 10, mix(eDark, '#000', 0.35)), { transform: 'rotate(-8 400 460)' });
      s += signalDot(400, 588, 8, eAccent); // real: dock charge indicator
      return s;
    },
  },
];

// ===========================================================================
// STORE B -- Fernwood Goods (artisan craft). Warm clay/linen/wood, no
// signal-dot motif -- none of these products carry an indicator light.
// ===========================================================================
const cClay = T.ember300, cClayDark = mix(T.ember600, T.ink900, 0.15);
const cCream = mix(T.paperSunken, T.amber50, 0.4), cCreamDark = mix(T.amber500, T.ink700, 0.35);
const cWood = mix(T.ember900, T.ink900, 0.35), cWoodLight = mix(T.ember400, T.amber500, 0.4);
const cLinen = mix(T.paperSunken, T.amber50, 0.6), cLinenDark = mix(T.ink300, T.amber500, 0.25);
const cBgBase = mix(T.amber50, T.ember300, 0.4); // warm clay/peach
const cBgGlow = T.paperRaised;

const craft = [
  {
    slug: 'hearth-ceramic-mug',
    bbox: { x: 308, y: 358, w: 254, h: 222 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 380, 560, 90, 20, cClay, cClayDark);
      s += pth('M 490 410 q 70 10 70 70 q 0 60 -70 70', 'none', { stroke: cClayDark, strokeWidth: 22, strokeLinecap: 'round' });
      s += ellipse(400, 380, 90, 20, mix(cClay, '#FFFFFF', 0.25), rim(false));
      s += ellipse(400, 380, 68, 13, mix(cClayDark, '#000', 0.2));
      s += glint(360, 420, 18, 40, 0.22);
      return s;
    },
  },
  {
    // Slender neck, smooth continuous taper to a modest base -- a bottle
    // profile, not a bulb-on-a-body figure.
    slug: 'bud-ceramic-vase',
    bbox: { x: 344, y: 228, w: 112, h: 396 },
    draw(defs) {
      let s = '';
      const id = nid('vase');
      defs.push(linearGrad(id, [[0, cCream], [1, cCreamDark]]));
      s += pth('M 352 620 L 448 620 C 458 620 460 600 456 580 C 448 528 420 500 412 460 C 406 428 404 400 404 350 L 404 290 L 396 290 L 396 350 C 396 400 394 428 388 460 C 380 500 352 528 344 580 C 340 600 342 620 352 620 Z',
        `url(#${id})`, rim(false));
      s += ellipse(400, 290, 12, 6, mix(cCreamDark, '#000', 0.15)); // rim opening
      s += ellipse(400, 620, 48, 11, mix(cCreamDark, '#000', 0.2));
      s += glint(384, 400, 8, 90, 0.28);
      s += pth('M 400 282 q 26 -22 8 -48', 'none', { stroke: mix(T.mint500, T.ink700, 0.3), strokeWidth: 9, strokeLinecap: 'round', opacity: 0.85 });
      return s;
    },
  },
  {
    slug: 'harvest-woven-tote',
    bbox: { x: 278, y: 323, w: 244, h: 289 },
    draw(defs) {
      let s = '';
      const id = nid('tote');
      defs.push(linearGrad(id, [[0, cLinen], [1, cLinenDark]]));
      s += pth('M 280 400 L 520 400 L 500 610 L 300 610 Z', `url(#${id})`, rim(false));
      for (let i = 0; i < 5; i++) s += line(290 + i * 46, 400, 290 + i * 46, 610, mix(cLinenDark, '#000', 0.1), 2, { strokeOpacity: 0.18 });
      s += pth('M 330 400 C 330 330 470 330 470 400', 'none', { stroke: cWood, strokeWidth: 14, strokeLinecap: 'round' });
      s += rect(280, 392, 240, 26, 8, mix(cLinenDark, '#000', 0.15));
      return s;
    },
  },
  {
    slug: 'amber-fields-candle',
    bbox: { x: 320, y: 370, w: 160, h: 230 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 420, 580, 78, 18, mix(cCream, '#FFFFFF', 0.3), cCreamDark);
      s += rect(340, 470, 120, 70, 4, mix(T.paperRaised, cCream, 0.4), rim(false));
      s += `<text x="400" y="510" text-anchor="middle" font-family="sans-serif" font-size="15" letter-spacing="2" fill="${cWoodLight}">FERNWOOD</text>`;
      s += `<text x="400" y="528" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="3" fill="${mix(cWoodLight, cCreamDark, 0.3)}">AMBER FIELDS</text>`;
      s += pth('M 400 420 q -4 -30 4 -46 q 8 16 4 46 z', mix(T.amber500, T.ember600, 0.4));
      s += ellipse(400, 372, 8, 14, T.ember500, { opacity: 0.7 });
      return s;
    },
  },
  {
    slug: 'maple-cutting-board',
    bbox: { x: 208, y: 398, w: 342, h: 204 },
    draw(defs) {
      let s = '';
      const id = nid('board');
      defs.push(linearGrad(id, [[0, cWoodLight], [1, cWood]]));
      s += pth('M 236 400 L 512 400 Q 548 400 548 436 L 548 564 Q 548 600 512 600 L 236 600 Q 210 600 210 570 L 210 430 Q 210 400 236 400 Z',
        `url(#${id})`, rim(true));
      for (let i = 0; i < 7; i++) s += line(230 + i * 46, 414, 230 + i * 46, 586, mix(cWood, '#000', 0.15), 2, { strokeOpacity: 0.2 });
      s += circle(516, 470, 13, mix(cWood, '#000', 0.35), rim(true));
      s += circle(516, 470, 6, mix(cWoodLight, '#000', 0.05));
      s += glint(270, 424, 90, 14, 0.14);
      return s;
    },
  },
  {
    slug: 'cabin-wool-throw',
    bbox: { x: 248, y: 398, w: 304, h: 262 },
    draw(defs) {
      let s = '';
      const colors = [cLinen, cClay, cWoodLight];
      let y = 400;
      for (let i = 0; i < 4; i++) {
        const h = 60;
        const id = nid('fold');
        defs.push(linearGrad(id, [[0, mix(colors[i % 3], '#FFFFFF', 0.15)], [1, colors[i % 3]]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
        s += rect(250, y, 300, h, 14, `url(#${id})`, rim(false));
        s += line(250, y + h, 550, y + h, T.ink900, 2, { strokeOpacity: 0.08 });
        y += h + 6;
      }
      for (let i = 0; i < 8; i++) s += line(270 + i * 36, 400, 270 + i * 36, y - 6, cWood, 2, { strokeOpacity: 0.12 });
      return s;
    },
  },
  {
    // Three distinctly-hued, offset bowls with visible rim rings, not three
    // shades of the same smear.
    slug: 'nested-ceramic-bowls',
    bbox: { x: 302, y: 456, w: 238, h: 144 },
    draw(defs) {
      let s = '';
      const sizes = [[400, 560, 135, 36], [382, 515, 96, 26], [368, 478, 60, 17]];
      const cols = [cCream, cClay, cWoodLight];
      sizes.forEach(([cx, cy, rx, ry], i) => {
        const id = nid('bowl');
        defs.push(linearGrad(id, [[0, mix(cols[i], '#FFFFFF', 0.2)], [1, mix(cols[i], T.ink900, 0.15)]]));
        s += ellipse(cx, cy, rx, ry, `url(#${id})`, rim(false));
        s += ellipse(cx, cy, rx, ry, 'none', { stroke: mix(cols[i], '#FFFFFF', 0.5), strokeWidth: 3, strokeOpacity: 0.8 }); // rim ring
        s += ellipse(cx, cy - ry * 0.32, rx * 0.78, ry * 0.55, mix(cols[i], T.ink900, 0.3));
        s += glint(cx - rx * 0.4, cy - ry * 0.55, rx * 0.2, ry * 0.32, 0.25);
      });
      return s;
    },
  },
  {
    // Bold, thick cords and a wide dowel -- built to survive at 120px, not
    // the previous hairline strands.
    slug: 'driftwood-macrame-hanging',
    bbox: { x: 273, y: 294, w: 254, h: 276 },
    draw(defs) {
      let s = '';
      s += rect(280, 300, 240, 18, 9, cWood, rim(true));
      const cords = [340, 400, 460];
      cords.forEach((x, i) => {
        const len = i === 1 ? 230 : 190;
        s += pth(`M ${x} 318 L ${x - 22} ${318 + len * 0.35} L ${x + 22} ${318 + len * 0.62} L ${x} ${318 + len}`,
          'none', { stroke: cLinenDark, strokeWidth: 16, strokeLinecap: 'round', strokeOpacity: 0.92 });
        s += circle(x, 318 + len * 0.35, 11, cWoodLight, rim(false));
        s += circle(x, 318 + len * 0.68, 11, cWoodLight, rim(false));
        // fringe fan at the bottom
        for (let f = -1; f <= 1; f++) {
          s += line(x, 318 + len, x + f * 16, 318 + len + 36, cLinenDark, 6, { strokeLinecap: 'round', strokeOpacity: 0.8 });
        }
      });
      return s;
    },
  },
  {
    slug: 'orchard-candle-trio',
    bbox: { x: 250, y: 392, w: 300, h: 184 },
    draw(defs) {
      let s = '';
      const jars = [[300, 470, 46], [400, 500, 56], [500, 470, 46]];
      jars.forEach(([cx, cy, r]) => {
        s += cylinderV(defs, cx, cy - 40, cy + 60, r, 12, mix(cCream, '#FFFFFF', 0.25), cCreamDark);
        s += ellipse(cx, cy - 68, 6, 10, T.ember500, { opacity: 0.7 });
      });
      return s;
    },
  },
  {
    slug: 'fieldnote-leather-journal',
    bbox: { x: 296, y: 344, w: 208, h: 296 },
    draw(defs) {
      let s = '';
      s += group(box(defs, 300, 380, 200, 260, 12, cWoodLight, cWood), { transform: 'rotate(-3 400 510)' });
      s += group(rect(300, 380, 18, 260, 6, mix(cWood, '#000', 0.2)), { transform: 'rotate(-3 400 510)' });
      s += group(pth('M 460 400 L 500 400 L 500 560 L 480 540 L 460 560 Z', mix(T.ember600, T.ink900, 0.1)),
        { transform: 'rotate(-3 400 510)', opacity: 0.9 });
      s += glint(340, 420, 40, 16, 0.12);
      return s;
    },
  },
  {
    // Real spoons: an oval bowl at the working end, a tapered handle -- not
    // a tapered point with no bowl.
    slug: 'birchwood-spoon-set',
    bbox: { x: 316, y: 292, w: 168, h: 270 },
    draw(defs) {
      let s = '';
      const id = nid('spoon');
      defs.push(linearGrad(id, [[0, cWoodLight], [1, cWood]]));
      const angles = [-16, 0, 16];
      angles.forEach((a, i) => {
        let spoon = pth(
          'M 392 560 L 391 400 C 388 392 384 388 384 372 C 384 344 392 322 400 322 C 408 322 416 344 416 372 C 416 388 412 392 409 400 L 408 560 Z',
          `url(#${id})`, rim(false)
        );
        if (i === 2) { // slotted spoon: two cutout ovals in the bowl
          spoon += ellipse(396, 350, 5, 12, mix(cWood, '#000', 0.3));
          spoon += ellipse(404, 358, 5, 12, mix(cWood, '#000', 0.3));
        }
        s += group(spoon, { transform: `rotate(${a} 400 560)` });
      });
      return s;
    },
  },
  {
    // A single smooth flaring trapezoid -- no separate limb-like elements.
    // A V-notch cut *into* the top edge reads as a neckline without adding
    // a head-and-shoulders gestalt; a bow knot sits flush on the body
    // instead of ties splaying out to the sides like arms.
    slug: 'market-linen-apron',
    bbox: { x: 328, y: 320, w: 144, h: 302 },
    draw(defs) {
      let s = '';
      const id = nid('apron');
      defs.push(linearGrad(id, [[0, mix(cLinen, '#FFFFFF', 0.2)], [1, cLinenDark]]));
      s += pth('M 372 322 L 393 322 L 400 340 L 407 322 L 428 322 L 468 402 L 468 620 L 332 620 L 332 402 Z',
        `url(#${id})`, rim(false));
      s += line(332, 402, 468, 402, cLinenDark, 2, { strokeOpacity: 0.25 }); // waist seam, straight across (no hip taper)
      // seamed patch pocket
      s += rect(360, 470, 80, 68, 8, mix(cLinenDark, '#FFFFFF', 0.12), rim(false));
      s += line(400, 476, 400, 532, cLinenDark, 2, { strokeOpacity: 0.4 });
      s += line(360, 484, 440, 484, cLinenDark, 2, { strokeOpacity: 0.3 });
      return s;
    },
  },
];

// ===========================================================================
// STORE C -- Ironline Fitness. Cold steel + charcoal rubber, no signal-dot
// motif -- none of these products carry an indicator light either.
// ===========================================================================
const fLight = T.ink500, fDark = T.ink900, fSteel = mix(T.ink200, T.ink400, 0.3), fSteelDark = T.ink500;
const fAccent = T.mint500;
const fBgBase = mix(T.ink200, T.mint500, 0.22); // cold steel-teal
const fBgGlow = T.paperRaised;

const fitness = [
  {
    slug: 'ironline-adjustable-dumbbell',
    bbox: { x: 224, y: 354, w: 352, h: 212 },
    draw(defs) {
      let s = '';
      s += capsuleH(defs, 300, 500, 460, 26, 26, fLight, fDark);
      for (const cx of [270, 320, 480, 530]) {
        s += cylinderV(defs, cx, 400, 520, 44, 44, fSteel, fSteelDark);
      }
      return s;
    },
  },
  {
    // Leaning cylinder with a spiral end-cap and a wrap strap -- a rolled
    // mat, not an upright bottle with a handle.
    slug: 'tracline-yoga-mat',
    bbox: { x: 214, y: 300, w: 380, h: 260 },
    draw(defs) {
      let inner = '';
      const bodyId = nid('matbody');
      defs.push(linearGrad(bodyId, [[0, mix(fAccent, '#FFFFFF', 0.3)], [1, mix(fAccent, T.ink900, 0.35)]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      inner += rect(280, 385, 280, 90, 0, `url(#${bodyId})`); // body between end caps
      inner += ellipse(560, 430, 34, 45, mix(fAccent, T.ink900, 0.4), rim(false)); // far end cap, flat
      // spiral rolled end (near end): concentric partial arcs
      const spiralCols = [mix(fAccent, '#FFFFFF', 0.35), mix(fAccent, T.ink900, 0.1), mix(fAccent, '#FFFFFF', 0.15), mix(fAccent, T.ink900, 0.3)];
      [40, 30, 20, 10].forEach((r, i) => {
        inner += ellipse(280, 430, r * 0.72, r, spiralCols[i], i === 0 ? rim(false) : {});
      });
      // wrap strap around the middle
      inner += rect(400, 360, 34, 140, 8, mix(T.ink900, '#000', 0.1), { opacity: 0.9 });
      inner += rect(408, 420, 18, 20, 3, fSteel);
      const s = group(inner, { transform: 'rotate(-16 410 430)' });
      return s;
    },
  },
  {
    // Ball body still, but a real flat base and a bigger open handle loop --
    // now clearly distinct from the mouse's notched teardrop.
    slug: 'anchor-kettlebell',
    bbox: { x: 266, y: 252, w: 268, h: 350 },
    draw(defs) {
      let s = '';
      s += ellipse(400, 578, 92, 20, mix(fDark, '#000', 0.15), rim(true)); // flat base
      s += sphere(defs, 400, 468, 118, fLight, fDark);
      s += pth('M 335 358 C 335 280 465 280 465 358 L 465 392 C 465 414 443 414 443 392 L 443 362 C 443 336 357 336 357 362 L 357 392 C 357 414 335 414 335 392 Z',
        mix(fLight, fDark, 0.4), rim(true));
      s += glint(348, 425, 30, 46, 0.16);
      return s;
    },
  },
  {
    // Three individually-rotated overlapping loops with real band width and
    // a sheen -- a pile, not a target.
    slug: 'looplevel-resistance-bands',
    bbox: { x: 216, y: 336, w: 350, h: 258 },
    draw(defs) {
      let s = '';
      const bands = [
        { cx: 345, cy: 425, rx: 108, ry: 66, rot: -14, w: 15, col: mix(fAccent, '#FFFFFF', 0.35) },
        { cx: 430, cy: 468, rx: 118, ry: 74, rot: 10, w: 20, col: fAccent },
        { cx: 388, cy: 505, rx: 96, ry: 60, rot: -6, w: 26, col: T.mint700 },
      ];
      bands.forEach((b) => {
        s += group(
          ellipse(b.cx, b.cy, b.rx, b.ry, 'none', { stroke: b.col, strokeWidth: b.w, strokeLinecap: 'round' }) +
          ellipse(b.cx, b.cy, b.rx, b.ry, 'none', { stroke: '#FFFFFF', strokeWidth: 3, strokeOpacity: 0.3 }),
          { transform: `rotate(${b.rot} ${b.cx} ${b.cy})` }
        );
      });
      return s;
    },
  },
  {
    // Two visible handles connected by a rope hanging in a real catenary.
    slug: 'speedcoil-jump-rope',
    bbox: { x: 232, y: 352, w: 336, h: 274 },
    draw(defs) {
      let s = '';
      s += pth('M 260 385 Q 400 620 540 385', 'none', { stroke: fDark, strokeWidth: 15, strokeLinecap: 'round' });
      s += pth('M 260 385 Q 400 600 540 385', 'none', { stroke: mix(fDark, '#FFFFFF', 0.2), strokeWidth: 3, strokeOpacity: 0.5 });
      s += cylinderV(defs, 260, 356, 460, 24, 24, fSteel, fSteelDark);
      s += cylinderV(defs, 540, 356, 460, 24, 24, fSteel, fSteelDark);
      return s;
    },
  },
  {
    // Flattened elliptical caps (proper cylinder perspective), a distinct
    // plastic core ring at each end, and a diagonal crosshatch texture.
    slug: 'corestrike-foam-roller',
    bbox: { x: 308, y: 350, w: 184, h: 240 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 380, 560, 88, 27, fSteel, fSteelDark);
      for (let i = -3; i <= 3; i++) {
        s += line(400 + i * 26, 380, 400 + i * 26 + 40, 560, fSteelDark, 3, { strokeOpacity: 0.16 });
        s += line(400 + i * 26, 380, 400 + i * 26 - 40, 560, fSteelDark, 3, { strokeOpacity: 0.16 });
      }
      s += ellipse(400, 380, 50, 15, mix(fSteelDark, T.ink900, 0.3), rim(true)); // core, top
      s += ellipse(400, 560, 50, 15, mix(fSteelDark, T.ink900, 0.3), rim(true)); // core, bottom
      return s;
    },
  },
  {
    slug: 'summit-water-bottle',
    bbox: { x: 330, y: 306, w: 140, h: 296 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 360, 580, 68, 20, fSteel, fSteelDark);
      s += cylinderV(defs, 400, 320, 362, 34, 12, fDark, T.ink950);
      s += glint(372, 400, 14, 90, 0.28);
      s += rect(370, 440, 60, 30, 6, fAccent, { opacity: 0.9 });
      return s;
    },
  },
  {
    slug: 'trailhead-duffel-bag',
    bbox: { x: 218, y: 366, w: 364, h: 216 },
    draw(defs) {
      let s = '';
      s += box(defs, 260, 420, 280, 160, 36, fLight, fDark);
      s += pth('M 320 420 C 320 370 480 370 480 420', 'none', { stroke: fSteelDark, strokeWidth: 14, strokeLinecap: 'round' });
      s += ellipse(400, 500, 46, 34, mix(fDark, '#000', 0.2));
      s += rect(310, 480, 40, 40, 8, fAccent, { opacity: 0.85 });
      s += pth('M 260 470 L 220 500', 'none', { stroke: fSteelDark, strokeWidth: 10, strokeLinecap: 'round' });
      s += pth('M 540 470 L 580 500', 'none', { stroke: fSteelDark, strokeWidth: 10, strokeLinecap: 'round' });
      return s;
    },
  },
  {
    slug: 'bench-press-incline-bench',
    bbox: { x: 148, y: 288, w: 502, h: 322 },
    draw(defs) {
      let s = '';
      s += box(defs, 240, 470, 220, 60, 18, fLight, fDark);
      s += group(box(defs, 430, 380, 130, 100, 16, fLight, fDark), { transform: 'rotate(-24 430 480)' });
      for (const x of [260, 420]) {
        s += rect(x, 530, 16, 70, 6, fSteelDark);
      }
      s += rect(150, 592, 500, 16, 6, mix(fSteelDark, '#000', 0.1));
      return s;
    },
  },
  {
    // Distinct twist-cap lid with a flip-spout, tick-mark measurements, and
    // a visible wire whisk ball.
    slug: 'shakerline-protein-shaker',
    bbox: { x: 326, y: 284, w: 148, h: 316 },
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 340, 580, 62, 18, mix(T.paperRaised, fSteel, 0.2), fSteelDark);
      for (const y of [420, 460, 500]) s += line(346, y, 366, y, fSteelDark, 3, { strokeOpacity: 0.4 }); // measurement ticks
      s += circle(400, 522, 11, mix(fSteelDark, '#FFFFFF', 0.2), rim(false)); // wire whisk ball
      s += line(391, 522, 409, 522, fDark, 2, { strokeOpacity: 0.6 });
      s += line(400, 513, 400, 531, fDark, 2, { strokeOpacity: 0.6 });
      s += ellipse(400, 326, 66, 15, mix(fDark, '#000', 0.15), rim(true)); // twist-cap lid
      s += rect(378, 288, 44, 38, 13, mix(fDark, '#000', 0.1), rim(true)); // flip spout
      s += ellipse(400, 288, 16, 5, fSteel, { opacity: 0.8 });
      s += glint(372, 400, 12, 80, 0.35);
      return s;
    },
  },
  {
    slug: 'tempo-ankle-weights',
    bbox: { x: 258, y: 396, w: 284, h: 116 },
    draw(defs) {
      let s = '';
      [330, 470].forEach((cx) => {
        s += box(defs, cx - 70, 420, 140, 90, 44, fLight, fDark);
        s += rect(cx - 70, 456, 140, 18, 4, mix(fDark, '#000', 0.25));
        s += rect(cx - 8, 400, 16, 30, 6, fSteelDark);
      });
      return s;
    },
  },
  {
    slug: 'thresh-pull-up-bar',
    bbox: { x: 223, y: 353, w: 354, h: 172 },
    draw(defs) {
      let s = '';
      s += capsuleH(defs, 260, 540, 380, 22, 22, fSteel, fSteelDark);
      s += cylinderV(defs, 260, 380, 500, 20, 20, fSteel, fSteelDark);
      s += cylinderV(defs, 540, 380, 500, 20, 20, fSteel, fSteelDark);
      s += rect(230, 495, 60, 24, 8, fDark, rim(true));
      s += rect(510, 495, 60, 24, 8, fDark, rim(true));
      return s;
    },
  },
];

// ===========================================================================
// Store shells: hero art + logo mark (no signal-dot motif here either).
// ===========================================================================
const STORES = [
  {
    key: 'basecamp-audio', slug: 'demo-electronics', bgBase: eBgBase, bgGlow: eBgGlow, products: electronics,
    heroDraw(defs) {
      let s = '';
      s += cylinderV(defs, 1180, 200, 480, 90, 26, eLight, eDark);
      const cupL = { x: 320, y: 480 }, cupR = { x: 560, y: 480 };
      const bandId = nid('hband');
      defs.push(linearGrad(bandId, [[0, eLight], [1, eMid]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      s += pth(`M ${cupL.x} ${cupL.y - 6} C ${cupL.x - 50} 300 ${cupR.x + 50} 300 ${cupR.x} ${cupR.y - 6}`, 'none', { stroke: `url(#${bandId})`, strokeWidth: 50, strokeLinecap: 'round' });
      for (const cup of [cupL, cupR]) {
        s += sphere(defs, cup.x, cup.y, 108, eLight, eDark);
        s += ellipse(cup.x, cup.y, 62, 70, mix(eDark, '#000', 0.2), { opacity: 0.9 });
        s += glint(cup.x - 36, cup.y - 42, 22, 14, 0.3);
      }
      s += groundShadowInline(1180, 500, 150, 22, 0.1);
      s += groundShadowInline(440, 660, 240, 26, 0.12);
      return s;
    },
    logoMark(defs) {
      const id = nid('lg');
      defs.push(radialGrad(id, [[0, eLight], [1, eDark]]));
      return circle(80, 80, 56, `url(#${id})`) + pth('M 40 80 A 40 40 0 0 1 120 80', 'none', { stroke: eAccent, strokeWidth: 8, strokeLinecap: 'round' })
        + circle(40, 80, 10, eDark) + circle(120, 80, 10, eDark);
    },
  },
  {
    key: 'fernwood-goods', slug: 'artisan-craft', bgBase: cBgBase, bgGlow: cBgGlow, products: craft,
    heroDraw(defs) {
      let s = '';
      s += cylinderV(defs, 1220, 300, 560, 100, 22, cClay, cClayDark);
      s += pth('M 1310 340 q 70 10 70 70 q 0 60 -70 70', 'none', { stroke: cClayDark, strokeWidth: 22, strokeLinecap: 'round' });
      const vaseId = nid('hvase');
      defs.push(linearGrad(vaseId, [[0, cCream], [1, cCreamDark]]));
      s += pth('M 340 620 L 460 620 L 438 420 C 490 360 490 260 430 210 C 460 180 460 130 400 116 C 340 130 340 180 370 210 C 310 260 310 360 362 420 Z', `url(#${vaseId})`, rim(false));
      s += pth('M 396 116 q 30 -18 10 -40', 'none', { stroke: mix(T.mint500, T.ink700, 0.3), strokeWidth: 10, strokeLinecap: 'round', opacity: 0.85 });
      s += groundShadowInline(1220, 585, 170, 24, 0.1);
      s += groundShadowInline(400, 660, 160, 22, 0.12);
      return s;
    },
    logoMark(defs) {
      const id = nid('lg');
      defs.push(linearGrad(id, [[0, cCream], [1, cCreamDark]]));
      return circle(80, 80, 52, `url(#${id})`) + pth('M 80 44 q 20 -14 6 -30', 'none', { stroke: mix(T.mint500, T.ink700, 0.3), strokeWidth: 6, strokeLinecap: 'round' });
    },
  },
  {
    key: 'ironline-fitness', slug: 'fitness-pro', bgBase: fBgBase, bgGlow: fBgGlow, products: fitness,
    heroDraw(defs) {
      let s = '';
      s += capsuleH(defs, 1000, 1360, 380, 30, 30, fLight, fDark);
      for (const cx of [960, 1020, 1340, 1400]) s += cylinderV(defs, cx, 260, 500, 56, 56, fSteel, fSteelDark);
      s += ellipse(420, 604, 66, 15, mix(fDark, '#000', 0.15), rim(true));
      s += sphere(defs, 420, 480, 130, fLight, fDark);
      s += pth('M 362 372 C 362 300 478 300 478 372 L 478 404 C 478 426 456 426 456 404 L 456 376 C 456 350 384 350 384 376 L 384 404 C 384 426 362 426 362 404 Z', mix(fLight, fDark, 0.4), rim(true));
      s += groundShadowInline(1170, 500, 220, 26, 0.1);
      s += groundShadowInline(420, 660, 190, 26, 0.12);
      return s;
    },
    logoMark(defs) {
      const id = nid('lg');
      defs.push(radialGrad(id, [[0, fLight], [1, fDark]]));
      return circle(80, 80, 52, `url(#${id})`) + pth('M 40 56 C 40 40 60 40 60 56 L 60 104 C 60 120 40 120 40 104 Z', fSteelDark)
        + pth('M 100 56 C 100 40 120 40 120 56 L 120 104 C 120 120 100 120 100 104 Z', fSteelDark)
        + rect(56 + 4, 74, 68 - 8, 12, 4, fAccent);
    },
  },
];

function groundShadowInline(cx, cy, rx, ry, opacity) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${T.ink900}" opacity="${opacity}"/>`;
}

module.exports = { STORES };
