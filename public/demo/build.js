#!/usr/bin/env node
/**
 * Renders every entry in catalog.js to disk under public/demo/{products,hero,logo}.
 *
 * Run: node public/demo/build.js
 *      node public/demo/build.js --qa   (also writes silhouette QA renders to
 *                                         .scratch/qa-silhouette/ for a naming-
 *                                         test review pass -- not shipped art)
 */
const fs = require('fs');
const path = require('path');
const { render, dirs } = require('./generate-art.js');
const { STORES } = require('./catalog.js');

const QA = process.argv.includes('--qa');
const QA_DIR = path.join(__dirname, '..', '..', '.scratch', 'qa-silhouette');
if (QA) fs.mkdirSync(QA_DIR, { recursive: true });

let count = 0;

for (const store of STORES) {
  for (const product of store.products) {
    const svg = render.renderProduct({
      bgBase: store.bgBase, bgGlow: store.bgGlow,
      draw: (defs) => product.draw(defs), bbox: product.bbox,
    });
    fs.writeFileSync(path.join(dirs.PRODUCTS_DIR, `${product.slug}.svg`), svg);
    count++;
    if (QA) {
      const silSvg = render.renderProductSilhouette({ draw: (defs) => product.draw(defs), bbox: product.bbox });
      fs.writeFileSync(path.join(QA_DIR, `${product.slug}.svg`), silSvg);
    }
  }
  const heroSvg = render.renderHero({ bgBase: store.bgBase, bgGlow: store.bgGlow, draw: (defs) => store.heroDraw(defs) });
  fs.writeFileSync(path.join(dirs.HERO_DIR, `${store.slug}.svg`), heroSvg);
  const logoSvg = render.renderLogo({ mark: (defs) => store.logoMark(defs) });
  fs.writeFileSync(path.join(dirs.LOGO_DIR, `${store.slug}.svg`), logoSvg);
  count += 2;
}

console.log(`Generated ${count} SVG assets.${QA ? ` QA silhouettes in ${QA_DIR}` : ''}`);
