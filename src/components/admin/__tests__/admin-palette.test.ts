import fs from 'fs';
import path from 'path';

/**
 * Guard-rails for the admin repalette.
 *
 * The admin was the last surface still rendering its own colour system: a
 * near-black top bar, a sidebar carrying purple, blue and red at once, six
 * differently-tinted stat cards, and ~500 hard-coded colour values across
 * 20k lines of Mantine written before the design system existed.
 *
 * The marketing side has `src/components/marketing/__tests__/palette.test.ts`
 * holding its line. This is the same idea for the admin, and it is deliberately
 * structural rather than a list of banned hexes: the point is that a future
 * edit has to delete a named rule to regress, instead of quietly re-adding a
 * colour.
 */

const ROOT = process.cwd();

const ADMIN_DIRS = [
  'src/app/admin',
  'src/components/admin',
  'src/components/wizard',
  'src/app/login',
];

/** Every source file under the admin surface. */
function adminFiles(extensions: RegExp = /\.(tsx?|css)$/): Array<{ file: string; src: string }> {
  const walk = (dir: string): string[] => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(rel);
      return extensions.test(entry.name) ? [rel] : [];
    });
  };

  return ADMIN_DIRS.flatMap(walk).map((file) => ({
    file,
    src: fs.readFileSync(path.join(ROOT, file), 'utf8'),
  }));
}

/**
 * Strips comments so a rule can talk about the colour it removed without
 * tripping over itself. Every "was #dc2626" note in the admin lives in a
 * comment on purpose — that is the record of what was fixed.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(?:\/\/|\s\*).*$/gm, '');
}

/** Max-minus-min channel spread, 0–1. A cheap saturation proxy. */
function chroma(hex: string): number {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7);
  const n = parseInt(full.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...ch) - Math.min(...ch)) / 255;
}

describe('admin — no colour outside the palette', () => {
  it('hard-codes no chromatic hex anywhere in the admin', () => {
    /*
     * Neutrals and the palette's own three semantic families are allowed as
     * literals (charts and <canvas> genuinely need values, not `var()`); a
     * SATURATED literal is what this forbids, because there is no legitimate
     * reason for one — the theme has no colour a component needs that
     * globals.css does not already name.
     */
    const allowed = new Set(
      [
        '#FFFFFF', '#FFF', '#F4F4F5', '#E5E5E7', '#D2D3D6', '#B0B3B9',
        '#111214', '#6B6F76', '#8A8E96', '#2A2C30', '#3F434A', '#1B1D20',
        '#0A0B0C', '#202327', '#383B41', '#000', '#000000',
        '#0F7B4A', '#E8F5EE', '#3FBF83', '#B45309', '#B42318',
      ].map((h) => h.toUpperCase())
    );

    const offenders: Array<{ file: string; hex: string }> = [];
    for (const { file, src } of adminFiles()) {
      for (const hex of stripComments(src).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        if (allowed.has(hex.toUpperCase())) continue;
        if (chroma(hex) < 0.06) continue; // a stray neutral is untidy, not off-palette
        offenders.push({ file, hex });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never names a decorative Mantine hue', () => {
    /*
     * `color="blue"` renders ink today only because rebel-theme.ts re-points
     * every hue name. That safety net should not become an excuse: naming a
     * hue still tells the next reader the colour is meaningful when it is not.
     * Only the three SEMANTIC names survive — green (signal), orange/yellow
     * (warning) and red (danger).
     */
    const banned = /\b(?:c|color|bg|bd)="(?:blue|cyan|indigo|violet|grape|pink|purple|teal|lime)(?:\.\d)?"/;
    const offenders = adminFiles(/\.tsx?$/)
      .filter(({ src }) => banned.test(stripComments(src)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('reaches for no --mantine-color-* ramp variable', () => {
    // Those resolve through Mantine's own scales, which are a second palette
    // sitting next to ours. Components read the semantic tokens instead.
    const offenders: Array<{ file: string; hits: string[] }> = [];
    for (const { file, src } of adminFiles()) {
      const hits = stripComments(src).match(/var\(--mantine-color-[a-z]+-\d\)/g) ?? [];
      if (hits.length) offenders.push({ file, hits });
    }
    expect(offenders).toEqual([]);
  });

  it('reaches for no decommissioned --ember-* or legacy --theme-* variable', () => {
    // `--ember-*` is a shim that renders monochrome, so a stale reference looks
    // fine and greps clean; `--theme-*` belongs to the merchant storefront
    // layer and has no business colouring RebelShops' own chrome.
    const offenders: Array<{ file: string; hits: string[] }> = [];
    for (const { file, src } of adminFiles()) {
      const hits = stripComments(src).match(/--(?:ember|theme)-[a-z0-9-]+/g) ?? [];
      if (hits.length) offenders.push({ file, hits });
    }
    expect(offenders).toEqual([]);
  });

  it('ships no decorative gradient in the admin', () => {
    /*
     * §1 anti-goals: "No pastel gradient soup." The top bar was a three-stop
     * near-black gradient and a badge was `variant="gradient"`.
     *
     * A gradient built entirely from tokens is not the thing being banned —
     * the colour-swatch transparency checkerboard is four `--ink-100` ramps and
     * is exactly right. What is banned is a gradient carrying a literal, which
     * is always somebody's decoration.
     */
    const offenders: Array<{ file: string; hit: string }> = [];
    for (const { file, src } of adminFiles()) {
      const clean = stripComments(src);
      if (clean.includes('variant="gradient"')) offenders.push({ file, hit: 'variant="gradient"' });
      for (const gradient of clean.match(/(?:linear|radial|conic)-gradient\([^;]*/g) ?? []) {
        if (/#[0-9a-fA-F]{3,8}|rgba?\(\s*\d/.test(gradient)) {
          offenders.push({ file, hit: gradient.slice(0, 60) });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('admin — the chrome the owner rejected, by name', () => {
  const header = fs.readFileSync(
    path.join(ROOT, 'src/components/admin/AdminHeader.tsx'),
    'utf8'
  );
  const nav = fs.readFileSync(path.join(ROOT, 'src/components/admin/AdminNav.tsx'), 'utf8');
  const chromeCss = fs.readFileSync(
    path.join(ROOT, 'src/components/admin/AdminChrome.module.css'),
    'utf8'
  );

  it('uses the real RebelShops mark, not the old red cart', () => {
    expect(header).toContain('/brand/logo-horizontal.svg');
    // Comments stripped: the header's own docblock names what it replaced.
    expect(stripComments(header)).not.toContain('RebelShopLogo');
  });

  it('has retired the name "RebelShop" and the tagline', () => {
    for (const { file, src } of adminFiles(/\.tsx?$/)) {
      // "RebelShop" without the trailing s, and the retired tagline.
      const stale = /RebelShop(?![s'])|Take Back Your Margins/.exec(stripComments(src));
      expect({ file, stale: stale?.[0] ?? null }).toEqual({ file, stale: null });
    }
  });

  it('paints the top bar on the page ground', () => {
    expect(chromeCss).toContain('background: var(--surface)');
  });

  it('indicates the active nav item with weight, a fill and a rule — never a hue', () => {
    expect(chromeCss).toContain('background-color: var(--surface-2)');
    expect(chromeCss).toContain('border-left-color: var(--text)');
    expect(nav).not.toMatch(/color="(?:violet|blue|red|indigo|teal|orange|pink|cyan|grape)"/);
  });

  it('treats signing out as navigation, not as a destructive action', () => {
    // "Logout" was styled with a red border, a red wash and red type. Nothing
    // is destroyed by signing out.
    expect(nav).not.toContain('color="red"');
    expect(nav).toContain('Sign out');
  });
});

describe('admin — the Mantine theme is the safety net', () => {
  const theme = fs.readFileSync(path.join(ROOT, 'src/lib/theme/rebel-theme.ts'), 'utf8');

  it('re-points every decorative Mantine hue onto the neutral ramp', () => {
    for (const hue of ['blue', 'cyan', 'indigo', 'violet', 'grape', 'pink', 'teal', 'lime', 'purple']) {
      expect(theme).toContain(`${hue}: inkTuple,`);
    }
  });

  it('maps the three semantic names, and only those, onto chromatic ramps', () => {
    expect(theme).toContain('green: mintTuple,');
    expect(theme).toContain('yellow: amberTuple,');
    expect(theme).toContain('orange: amberTuple,');
    expect(theme).toContain('red: roseTuple,');
  });

  it('keeps the primary action on ink', () => {
    expect(theme).toContain("primaryColor: 'ink'");
    expect(theme).toContain('primaryShade: { light: 9, dark: 0 }');
  });
});
