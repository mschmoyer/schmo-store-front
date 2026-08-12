#!/usr/bin/env node
/**
 * Product/hero/logo illustration catalog for the three RebelShops demo stores.
 * Pure data + draw functions -- run `node generate-art.js` (or `node build.js`)
 * to rasterize nothing and just emit the SVGs these describe.
 *
 * Each store's palette is derived entirely from docs/design-system.md tokens
 * via generate-art.js's `mix()` helper -- no invented hexes.
 */
const { T, mix, nid, defs: gdefs, shapes, render, dirs } = require('./generate-art.js');
const { rect, ellipse, circle, path: pth, line, group, cylinderV, capsuleH, sphere, box, glint, signalDot, rim } = shapes;
const { linearGrad, radialGrad } = gdefs;

// ===========================================================================
// STORE A -- Basecamp Audio (electronics). Graphite ink body, ember signal.
// ===========================================================================
const eLight = T.ink400, eMid = T.ink600, eDark = T.ink900, eAccent = T.ember500;
const eWash = T.ink100;

const electronics = [
  {
    slug: 'aviator-headphones-onyx',
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
      s += signalDot(cupR.x + 66, cupR.y + 58, 9, eAccent);
      return s;
    },
  },
  {
    slug: 'pulse-earbuds-case',
    draw(defs) {
      let s = '';
      const cx = 400, caseY = 420;
      s += box(defs, cx - 130, caseY, 260, 150, 34, eLight, eDark);
      s += rect(cx - 130, caseY, 260, 34, 17, mix(eLight, '#FFFFFF', 0.15), { opacity: 0.5 });
      s += ellipse(cx - 58, caseY + 78, 34, 26, mix(eDark, '#000000', 0.25));
      s += ellipse(cx + 58, caseY + 78, 34, 26, mix(eDark, '#000000', 0.25));
      s += signalDot(cx, caseY + 132, 8, eAccent);
      // one earbud floating beside the case
      const bx = cx + 190, by = 360;
      s += sphere(defs, bx, by, 46, eLight, eMid);
      s += pth(`M ${bx + 20} ${by + 30} q 30 20 26 62`, 'none', { stroke: eMid, strokeWidth: 14, strokeLinecap: 'round' });
      s += glint(bx - 14, by - 16, 12, 8, 0.4);
      return s;
    },
  },
  {
    slug: 'keystroke-mechanical-keyboard',
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
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 300, 600, 110, 30, eLight, eDark);
      for (const r of [92, 68, 44]) s += circle(400, 300, r, 'none', { stroke: mix(eDark, '#000000', 0.2), strokeWidth: 3, strokeOpacity: 0.5 });
      s += circle(400, 300, 20, mix(eDark, '#000000', 0.3));
      s += glint(360, 270, 26, 12, 0.25);
      s += signalDot(400, 560, 9, eAccent);
      return s;
    },
  },
  {
    slug: 'orbit-webcam-clip',
    draw(defs) {
      let s = '';
      s += box(defs, 320, 370, 160, 100, 26, eLight, eDark);
      s += sphere(defs, 400, 400, 46, eLight, eDark);
      s += circle(400, 400, 26, mix(eDark, '#000000', 0.4));
      s += circle(400, 400, 12, '#050608');
      s += glint(386, 386, 8, 5, 0.5);
      s += pth('M 340 470 q -10 60 40 90 q -18 -50 -6 -84 z', mix(eLight, eDark, 0.5), rimless());
      s += signalDot(452, 388, 7, eAccent);
      return s;
    },
  },
  {
    slug: 'voltpack-power-bank',
    draw(defs) {
      let s = '';
      s += box(defs, 320, 320, 160, 300, 28, eLight, eDark);
      s += rect(340, 350, 120, 6, 3, mix(eLight, '#FFFFFF', 0.4), { opacity: 0.5 });
      for (let i = 0; i < 4; i++) {
        const cy = 400 + i * 34;
        s += circle(400, cy, 8, i < 3 ? eAccent : mix(eDark, '#000', 0.3), { opacity: i < 3 ? 1 : 0.5 });
      }
      s += pth('M 480 560 q 60 10 70 60 q -50 -30 -84 -8', 'none', { stroke: eMid, strokeWidth: 10, strokeLinecap: 'round' });
      return s;
    },
  },
  {
    slug: 'arclight-desk-lamp',
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
      s += signalDot(400, 596, 8, eAccent);
      return s;
    },
  },
  {
    slug: 'glide-wireless-mouse',
    draw(defs) {
      let s = '';
      const id = nid('mouse');
      defs.push(radialGrad(id, [[0, eLight], [0.7, eDark], [1, eDark]], { cx: 0.32, cy: 0.22, r: 0.9 }));
      s += pth('M 400 340 C 480 340 520 400 520 470 C 520 550 465 600 400 600 C 335 600 280 550 280 470 C 280 400 320 340 400 340 Z', `url(#${id})`, rim(false));
      s += line(400, 350, 400, 430, mix(eDark, '#000', 0.2), 3, { strokeOpacity: 0.5 });
      s += ellipse(400, 385, 10, 22, mix(eDark, '#000', 0.3));
      s += glint(350, 380, 26, 16, 0.3);
      s += signalDot(400, 560, 8, eAccent);
      return s;
    },
  },
  {
    slug: 'hubline-usb-c-hub',
    draw(defs) {
      let s = '';
      s += group(box(defs, 300, 400, 200, 90, 20, eLight, eDark), { transform: 'rotate(-4 400 445)' });
      for (let i = 0; i < 3; i++) {
        s += rect(330 + i * 50, 424, 30, 14, 4, mix(eDark, '#000', 0.3));
      }
      s += pth('M 300 460 q -60 20 -70 80', 'none', { stroke: eMid, strokeWidth: 12, strokeLinecap: 'round' });
      s += signalDot(490, 470, 7, eAccent);
      return s;
    },
  },
  {
    slug: 'pulse-smartwatch',
    draw(defs) {
      let s = '';
      s += pth('M 340 300 L 460 300 L 440 400 L 360 400 Z', mix(eLight, eDark, 0.5), rim(false));
      s += pth('M 340 600 L 460 600 L 440 500 L 360 500 Z', mix(eLight, eDark, 0.5), rim(false));
      s += box(defs, 320, 360, 160, 160, 30, eLight, eDark);
      s += rect(340, 380, 120, 120, 20, mix(eDark, '#000', 0.35));
      s += circle(468, 420, 10, eDark);
      s += glint(360, 396, 30, 16, 0.18);
      s += signalDot(400, 440, 9, eAccent);
      return s;
    },
  },
  {
    slug: 'driftcase-portable-ssd',
    draw(defs) {
      let s = '';
      s += group(box(defs, 280, 400, 240, 130, 22, eLight, eDark), { transform: 'skewY(-2)' });
      for (let i = 0; i < 3; i++) {
        s += line(300, 430 + i * 24, 500, 430 + i * 24, mix(eLight, '#FFFFFF', 0.3), 2, { strokeOpacity: 0.25 });
      }
      s += signalDot(470, 500, 8, eAccent);
      return s;
    },
  },
  {
    slug: 'anchor-charging-dock',
    draw(defs) {
      let s = '';
      s += pth('M 300 600 L 500 600 L 460 420 L 340 420 Z', mix(eLight, eDark, 0.55), rim(false));
      s += group(box(defs, 355, 300, 90, 170, 18, eLight, eDark), { transform: 'rotate(-8 400 460)' });
      s += group(rect(365, 314, 70, 142, 10, mix(eDark, '#000', 0.35)), { transform: 'rotate(-8 400 460)' });
      s += signalDot(400, 588, 8, eAccent);
      return s;
    },
  },
];

// ===========================================================================
// STORE B -- Fernwood Goods (artisan craft). Clay/linen tones, ember seal.
// ===========================================================================
const cClay = T.ember300, cClayDark = mix(T.ember600, T.ink900, 0.15);
const cCream = mix(T.paperSunken, T.amber50, 0.4), cCreamDark = mix(T.amber500, T.ink700, 0.35);
const cWood = mix(T.ember900, T.ink900, 0.35), cWoodLight = mix(T.ember400, T.amber500, 0.4);
const cLinen = mix(T.paperSunken, T.amber50, 0.6), cLinenDark = mix(T.ink300, T.amber500, 0.25);
const cAccent = T.ember600;
const cWash = T.amber50;

const craft = [
  {
    slug: 'hearth-ceramic-mug',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 380, 560, 90, 20, cClay, cClayDark);
      s += pth('M 490 410 q 70 10 70 70 q 0 60 -70 70', 'none', { stroke: cClayDark, strokeWidth: 22, strokeLinecap: 'round' });
      s += ellipse(400, 380, 90, 20, mix(cClay, '#FFFFFF', 0.25), rim(false));
      s += ellipse(400, 380, 68, 13, mix(cClayDark, '#000', 0.2));
      s += glint(360, 420, 18, 40, 0.22);
      s += signalDot(400, 552, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'bud-ceramic-vase',
    draw(defs) {
      let s = '';
      s += pth('M 360 620 L 440 620 L 424 480 C 460 440 460 360 420 320 C 440 300 440 260 400 250 C 360 260 360 300 380 320 C 340 360 340 440 376 480 Z',
        `url(#${(() => { const id = nid('vase'); defs.push(linearGrad(id, [[0, cCream], [1, cCreamDark]])); return id; })()})`, rim(false));
      s += ellipse(400, 620, 40, 10, mix(cCreamDark, '#000', 0.2));
      s += glint(378, 340, 12, 60, 0.3);
      s += pth('M 396 250 q 30 -18 10 -40', 'none', { stroke: mix(T.mint500, T.ink700, 0.3), strokeWidth: 10, strokeLinecap: 'round', opacity: 0.85 });
      s += signalDot(430, 600, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'harvest-woven-tote',
    draw(defs) {
      let s = '';
      const id = nid('tote');
      defs.push(linearGrad(id, [[0, cLinen], [1, cLinenDark]]));
      s += pth('M 280 400 L 520 400 L 500 610 L 300 610 Z', `url(#${id})`, rim(false));
      for (let i = 0; i < 5; i++) s += line(290 + i * 46, 400, 290 + i * 46, 610, mix(cLinenDark, '#000', 0.1), 2, { strokeOpacity: 0.18 });
      s += pth('M 330 400 C 330 330 470 330 470 400', 'none', { stroke: cWood, strokeWidth: 14, strokeLinecap: 'round' });
      s += rect(280, 392, 240, 26, 8, mix(cLinenDark, '#000', 0.15));
      s += signalDot(490, 430, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'amber-fields-candle',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 420, 580, 78, 18, mix(cCream, '#FFFFFF', 0.3), cCreamDark);
      s += rect(340, 470, 120, 70, 4, mix(T.paperRaised, cCream, 0.4), rim(false));
      s += `<text x="400" y="510" text-anchor="middle" font-family="sans-serif" font-size="15" letter-spacing="2" fill="${cWoodLight}">FERNWOOD</text>`;
      s += `<text x="400" y="528" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="3" fill="${mix(cWoodLight, cCreamDark, 0.3)}">AMBER FIELDS</text>`;
      s += pth('M 400 420 q -4 -30 4 -46 q 8 16 4 46 z', mix(T.amber500, T.ember600, 0.4));
      s += ellipse(400, 372, 8, 14, T.ember500, { opacity: 0.7 });
      s += signalDot(462, 550, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'maple-cutting-board',
    draw(defs) {
      let s = '';
      const id = nid('board');
      defs.push(linearGrad(id, [[0, cWoodLight], [1, cWood]]));
      s += pth('M 250 500 Q 250 420 330 420 L 470 420 Q 550 420 550 500 L 550 540 Q 550 600 470 600 L 330 600 Q 250 600 250 540 Z',
        `url(#${id})`, rim(true));
      for (let i = 0; i < 5; i++) s += line(270 + i * 60, 430, 270 + i * 60, 590, mix(cWood, '#000', 0.15), 2, { strokeOpacity: 0.22 });
      s += circle(520, 440, 12, mix(cWood, '#000', 0.3), rim(true));
      s += circle(520, 440, 5, mix(cWoodLight, '#000', 0.1));
      s += glint(320, 450, 40, 14, 0.15);
      s += signalDot(280, 570, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'cabin-wool-throw',
    draw(defs) {
      let s = '';
      const colors = [cLinen, cClay, cWoodLight];
      let y = 400;
      for (let i = 0; i < 4; i++) {
        const h = 60;
        const id = nid('fold');
        defs.push(linearGrad(id, [[0, mix(colors[i % 3], '#FFFFFF', 0.15)], [1, colors[i % 3]]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
        s += rect(250, y, 300, h, 14, `url(#${id})`, rim(false));
        s += line(250, y + h, 550, y + h, mix(T.ink900, '#000', 0), 2, { strokeOpacity: 0.08 });
        y += h + 6;
      }
      for (let i = 0; i < 8; i++) s += line(270 + i * 36, 400, 270 + i * 36, y - 6, cWood, 2, { strokeOpacity: 0.12 });
      s += signalDot(530, 415, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'nested-ceramic-bowls',
    draw(defs) {
      let s = '';
      const sizes = [[400, 560, 130, 34], [400, 505, 96, 26], [400, 462, 62, 18]];
      const cols = [cCream, cClay, cWoodLight];
      sizes.forEach(([cx, cy, rx, ry], i) => {
        const id = nid('bowl');
        defs.push(linearGrad(id, [[0, mix(cols[i], '#FFFFFF', 0.2)], [1, mix(cols[i], T.ink900, 0.15)]]));
        s += ellipse(cx, cy, rx, ry, `url(#${id})`, rim(false));
        s += ellipse(cx, cy - ry * 0.35, rx * 0.82, ry * 0.6, mix(cols[i], T.ink900, 0.25));
        s += glint(cx - rx * 0.4, cy - ry * 0.6, rx * 0.22, ry * 0.35, 0.25);
      });
      s += signalDot(478, 470, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'driftwood-macrame-hanging',
    draw(defs) {
      let s = '';
      s += rect(300, 300, 200, 14, 6, cWood, rim(true));
      const knots = [330, 370, 400, 430, 470];
      knots.forEach((x, i) => {
        const len = 180 + (i % 2) * 60;
        s += pth(`M ${x} 314 C ${x - 10} ${314 + len * 0.4} ${x + 10} ${314 + len * 0.6} ${x} ${314 + len}`,
          'none', { stroke: cLinenDark, strokeWidth: 6, strokeOpacity: 0.8 });
        for (let k = 0; k < 3; k++) s += circle(x, 360 + k * 60, 5, cLinen, { opacity: 0.9 });
      });
      s += signalDot(478, 306, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'orchard-candle-trio',
    draw(defs) {
      let s = '';
      const jars = [[300, 470, 46], [400, 500, 56], [500, 470, 46]];
      jars.forEach(([cx, cy, r], i) => {
        s += cylinderV(defs, cx, cy - 40, cy + 60, r, 12, mix(cCream, '#FFFFFF', 0.25), cCreamDark);
        s += ellipse(cx, cy - 68, 6, 10, T.ember500, { opacity: 0.7 });
      });
      s += signalDot(452, 440, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'fieldnote-leather-journal',
    draw(defs) {
      let s = '';
      const id = nid('journal');
      defs.push(linearGrad(id, [[0, cWoodLight], [1, cWood]]));
      s += group(box(defs, 300, 380, 200, 260, 12, cWoodLight, cWood), { transform: 'rotate(-3 400 510)' });
      s += group(rect(300, 380, 18, 260, 6, mix(cWood, '#000', 0.2)), { transform: 'rotate(-3 400 510)' });
      s += group(pth('M 460 400 L 500 400 L 500 560 L 480 540 L 460 560 Z', cAccent), { transform: 'rotate(-3 400 510)', opacity: 0.9 });
      s += glint(340, 420, 40, 16, 0.12);
      return s;
    },
  },
  {
    slug: 'birchwood-spoon-set',
    draw(defs) {
      let s = '';
      const id = nid('spoon');
      defs.push(linearGrad(id, [[0, cWoodLight], [1, cWood]]));
      const angles = [-18, 0, 18];
      angles.forEach((a) => {
        s += group(
          pth('M 400 260 C 380 260 372 290 380 320 L 392 560 L 408 560 L 420 320 C 428 290 420 260 400 260 Z', `url(#${id})`, rim(false)),
          { transform: `rotate(${a} 400 560)` }
        );
      });
      s += signalDot(400, 250, 7, cAccent);
      return s;
    },
  },
  {
    slug: 'market-linen-apron',
    draw(defs) {
      let s = '';
      const id = nid('apron');
      defs.push(linearGrad(id, [[0, mix(cLinen, '#FFFFFF', 0.2)], [1, cLinenDark]]));
      s += pth('M 340 320 L 460 320 L 480 380 L 460 380 L 460 620 L 340 620 L 340 380 L 320 380 Z', `url(#${id})`, rim(false));
      s += pth('M 340 340 C 280 340 260 320 240 300', 'none', { stroke: cLinenDark, strokeWidth: 8, strokeLinecap: 'round' });
      s += pth('M 460 340 C 520 340 540 320 560 300', 'none', { stroke: cLinenDark, strokeWidth: 8, strokeLinecap: 'round' });
      s += rect(360, 470, 80, 60, 8, mix(cLinenDark, '#FFFFFF', 0.1), { opacity: 0.6, ...rim(false) });
      s += signalDot(430, 500, 7, cAccent);
      return s;
    },
  },
];

// ===========================================================================
// STORE C -- Ironline Fitness. Charcoal rubber + steel, mint signal.
// ===========================================================================
const fLight = T.ink500, fDark = T.ink900, fSteel = mix(T.ink200, T.ink400, 0.3), fSteelDark = T.ink500;
const fAccent = T.mint500;
const fWash = T.mint50;

const fitness = [
  {
    slug: 'ironline-adjustable-dumbbell',
    draw(defs) {
      let s = '';
      s += capsuleH(defs, 300, 500, 460, 26, 26, fLight, fDark);
      for (const cx of [270, 320, 480, 530]) {
        s += cylinderV(defs, cx, 400, 520, 44, 44, fSteel, fSteelDark);
      }
      s += signalDot(400, 480, 8, fAccent);
      return s;
    },
  },
  {
    slug: 'tracline-yoga-mat',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 340, 560, 54, 54, mix(fAccent, '#FFFFFF', 0.25), mix(fAccent, T.ink900, 0.3));
      s += pth('M 400 340 A 54 54 0 0 1 400 448', 'none', { stroke: T.paperRaised, strokeWidth: 6, strokeOpacity: 0.35 });
      s += pth('M 470 400 q 90 20 70 200', 'none', { stroke: fLight, strokeWidth: 30, strokeLinecap: 'round', opacity: 0.9 });
      s += signalDot(400, 340, 8, T.ember500);
      return s;
    },
  },
  {
    slug: 'anchor-kettlebell',
    draw(defs) {
      let s = '';
      s += sphere(defs, 400, 470, 130, fLight, fDark);
      s += pth('M 340 350 C 340 300 460 300 460 350 L 460 380 C 460 400 440 400 440 380 L 440 355 C 440 335 360 335 360 355 L 360 380 C 360 400 340 400 340 380 Z',
        mix(fLight, fDark, 0.4), rim(true));
      s += glint(350, 420, 30, 46, 0.16);
      s += signalDot(400, 470, 9, fAccent);
      return s;
    },
  },
  {
    slug: 'looplevel-resistance-bands',
    draw(defs) {
      let s = '';
      const cols = [fAccent, T.ember500, fSteel];
      const rs = [150, 118, 86];
      rs.forEach((r, i) => {
        s += ellipse(400, 470, r, r * 0.42, 'none', { stroke: cols[i], strokeWidth: 16, strokeOpacity: 0.85 });
      });
      s += signalDot(400, 470, 9, fDark);
      return s;
    },
  },
  {
    slug: 'speedcoil-jump-rope',
    draw(defs) {
      let s = '';
      for (let i = 0; i < 5; i++) {
        s += ellipse(400, 420 + i * 20, 120 - i * 14, 20, 'none', { stroke: fDark, strokeWidth: 10, strokeOpacity: 0.85 - i * 0.1 });
      }
      s += capsuleH(defs, 260, 300, 470, 20, 20, fSteel, fSteelDark);
      s += capsuleH(defs, 500, 540, 470, 20, 20, fSteel, fSteelDark);
      s += signalDot(280, 470, 7, fAccent);
      s += signalDot(520, 470, 7, fAccent);
      return s;
    },
  },
  {
    slug: 'corestrike-foam-roller',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 380, 560, 88, 88, fSteel, fSteelDark);
      for (let i = -2; i <= 2; i++) s += line(400 + i * 32, 380, 400 + i * 32, 560, fSteelDark, 3, { strokeOpacity: 0.2 });
      s += signalDot(400, 380, 8, fAccent);
      return s;
    },
  },
  {
    slug: 'summit-water-bottle',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 360, 580, 68, 20, fSteel, fSteelDark);
      s += cylinderV(defs, 400, 320, 362, 34, 12, fDark, T.ink950);
      s += glint(372, 400, 14, 90, 0.28);
      s += rect(370, 440, 60, 30, 6, fAccent, { opacity: 0.9 });
      s += signalDot(400, 320, 6, fAccent);
      return s;
    },
  },
  {
    slug: 'trailhead-duffel-bag',
    draw(defs) {
      let s = '';
      s += box(defs, 260, 420, 280, 160, 36, fLight, fDark);
      s += pth('M 320 420 C 320 370 480 370 480 420', 'none', { stroke: fSteelDark, strokeWidth: 14, strokeLinecap: 'round' });
      s += ellipse(400, 500, 46, 34, mix(fDark, '#000', 0.2));
      s += rect(310, 480, 40, 40, 8, fAccent, { opacity: 0.85 });
      s += pth('M 260 470 L 220 500', 'none', { stroke: fSteelDark, strokeWidth: 10, strokeLinecap: 'round' });
      s += pth('M 540 470 L 580 500', 'none', { stroke: fSteelDark, strokeWidth: 10, strokeLinecap: 'round' });
      s += signalDot(470, 440, 7, fAccent);
      return s;
    },
  },
  {
    slug: 'bench-press-incline-bench',
    draw(defs) {
      let s = '';
      s += box(defs, 240, 470, 220, 60, 18, fLight, fDark);
      s += group(box(defs, 430, 380, 130, 100, 16, fLight, fDark), { transform: 'rotate(-24 430 480)' });
      for (const x of [260, 420]) {
        s += rect(x, 530, 16, 70, 6, fSteelDark);
      }
      s += rect(150, 592, 500, 16, 6, mix(fSteelDark, '#000', 0.1));
      s += signalDot(280, 490, 7, fAccent);
      return s;
    },
  },
  {
    slug: 'shakerline-protein-shaker',
    draw(defs) {
      let s = '';
      s += cylinderV(defs, 400, 340, 580, 62, 18, mix(T.paperRaised, fSteel, 0.2), fSteelDark);
      s += rect(348, 300, 104, 50, 10, fDark, rim(true));
      s += ellipse(400, 300, 52, 12, mix(fDark, '#000', 0.2));
      s += glint(370, 400, 12, 90, 0.35);
      s += signalDot(400, 300, 6, fAccent);
      return s;
    },
  },
  {
    slug: 'tempo-ankle-weights',
    draw(defs) {
      let s = '';
      [330, 470].forEach((cx) => {
        s += box(defs, cx - 70, 420, 140, 90, 44, fLight, fDark);
        s += rect(cx - 70, 456, 140, 18, 4, mix(fDark, '#000', 0.25));
        s += rect(cx - 8, 400, 16, 30, 6, fSteelDark);
      });
      s += signalDot(400, 465, 8, fAccent);
      return s;
    },
  },
  {
    slug: 'thresh-pull-up-bar',
    draw(defs) {
      let s = '';
      s += capsuleH(defs, 260, 540, 380, 22, 22, fSteel, fSteelDark);
      s += cylinderV(defs, 260, 380, 500, 20, 20, fSteel, fSteelDark);
      s += cylinderV(defs, 540, 380, 500, 20, 20, fSteel, fSteelDark);
      s += rect(230, 495, 60, 24, 8, fDark, rim(true));
      s += rect(510, 495, 60, 24, 8, fDark, rim(true));
      s += signalDot(400, 380, 8, fAccent);
      return s;
    },
  },
];

function rimless() {
  return { strokeOpacity: 0 };
}

const STORES = [
  { key: 'basecamp-audio', slug: 'demo-electronics', washTint: eWash, products: electronics,
    heroDraw(defs) {
      let s = '';
      s += group(cylinderV(defs, 1180, 200, 480, 90, 26, eLight, eDark), { transform: 'translate(0,0)' });
      const cupL = { x: 320, y: 480 }, cupR = { x: 560, y: 480 };
      const bandId = nid('hband');
      defs.push(linearGrad(bandId, [[0, eLight], [1, eMid]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      s += pth(`M ${cupL.x} ${cupL.y - 6} C ${cupL.x - 50} 300 ${cupR.x + 50} 300 ${cupR.x} ${cupR.y - 6}`, 'none', { stroke: `url(#${bandId})`, strokeWidth: 50, strokeLinecap: 'round' });
      for (const cup of [cupL, cupR]) {
        s += sphere(defs, cup.x, cup.y, 108, eLight, eDark);
        s += ellipse(cup.x, cup.y, 62, 70, mix(eDark, '#000', 0.2), { opacity: 0.9 });
        s += glint(cup.x - 36, cup.y - 42, 22, 14, 0.3);
      }
      s += signalDot(cupR.x + 76, cupR.y + 64, 10, eAccent);
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
  { key: 'fernwood-goods', slug: 'artisan-craft', washTint: cWash, products: craft,
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
      s += signalDot(430, 560, 9, cAccent);
      return s;
    },
    logoMark(defs) {
      const id = nid('lg');
      defs.push(linearGrad(id, [[0, cCream], [1, cCreamDark]]));
      return circle(80, 80, 52, `url(#${id})`) + circle(80, 58, 9, T.ember500, { opacity: 0.85 });
    },
  },
  { key: 'ironline-fitness', slug: 'fitness-pro', washTint: fWash, products: fitness,
    heroDraw(defs) {
      let s = '';
      s += capsuleH(defs, 1000, 1360, 380, 30, 30, fLight, fDark);
      for (const cx of [960, 1020, 1340, 1400]) s += cylinderV(defs, cx, 260, 500, 56, 56, fSteel, fSteelDark);
      s += sphere(defs, 420, 480, 140, fLight, fDark);
      s += pth('M 356 356 C 356 300 484 300 484 356 L 484 390 C 484 412 462 412 462 390 L 462 362 C 462 340 378 340 378 362 L 378 390 C 378 412 356 412 356 390 Z', mix(fLight, fDark, 0.4), rim(true));
      s += groundShadowInline(1170, 500, 220, 26, 0.1);
      s += groundShadowInline(420, 640, 190, 26, 0.12);
      s += signalDot(420, 480, 10, fAccent);
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
