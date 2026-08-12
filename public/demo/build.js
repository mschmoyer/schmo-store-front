#!/usr/bin/env node
/**
 * Renders every entry in catalog.js to disk under public/demo/{products,hero,logo}.
 * Run: node public/demo/build.js
 */
const fs = require('fs');
const path = require('path');
const { render, dirs } = require('./generate-art.js');
const { STORES } = require('./catalog.js');

let count = 0;

for (const store of STORES) {
  for (const product of store.products) {
    const svg = render.renderProduct({ washTint: store.washTint, draw: (defs) => product.draw(defs) });
    fs.writeFileSync(path.join(dirs.PRODUCTS_DIR, `${product.slug}.svg`), svg);
    count++;
  }
  const heroSvg = render.renderHero({ washTint: store.washTint, draw: (defs) => store.heroDraw(defs) });
  fs.writeFileSync(path.join(dirs.HERO_DIR, `${store.slug}.svg`), heroSvg);
  const logoSvg = render.renderLogo({ mark: (defs) => store.logoMark(defs) });
  fs.writeFileSync(path.join(dirs.LOGO_DIR, `${store.slug}.svg`), logoSvg);
  count += 2;
}

console.log(`Generated ${count} SVG assets.`);
