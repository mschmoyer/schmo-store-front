import fs from 'fs';
import path from 'path';
import { ember, ink, mint, paper, rose, amber } from '@/lib/design/tokens';

/**
 * Guard-rails for the near-monochrome repalette and the single-ground layout.
 *
 * The owner rejected the previous design for three separate reasons — the
 * vermilion scheme, "some dark on top of light", and a disjointed layout. Each
 * assertion below pins one of the decisions that answered them, so a later edit
 * has to delete a named rule rather than quietly regress it.
 */

const ROOT = process.cwd();
const GLOBALS = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const SECTION_CSS = fs.readFileSync(
  path.join(ROOT, 'src/components/marketing/parts/Section.module.css'),
  'utf8'
);

/** Every `.module.css` under the marketing tree, plus the marketing routes. */
function marketingStylesheets(): Array<{ file: string; css: string }> {
  const dirs = [
    'src/components/marketing',
    'src/app/features',
    'src/app/how-it-works',
    'src/app/demo-stores',
  ];

  const walk = (dir: string): string[] => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(rel);
      return entry.name.endsWith('.module.css') ? [rel] : [];
    });
  };

  return dirs
    .flatMap(walk)
    .map((file) => ({ file, css: fs.readFileSync(path.join(ROOT, file), 'utf8') }));
}

/* -------------------------------------------------------------------------
 * Colour maths, so the rules below can be stated as thresholds rather than as
 * a list of hexes somebody has to remember to extend.
 * ---------------------------------------------------------------------- */

/** Every token whose job is "a filled surface that carries a white label". */
const SOLID_FILL_TOKENS = [
  '--accent-solid',
  '--accent-solid-hover',
  '--success-solid',
  '--warning-solid',
  '--danger-solid',
] as const;

/**
 * Resolves a custom property from the `:root` block of `globals.css`, following
 * `var()` indirection until it reaches a literal hex.
 *
 * @param token - Property name, including the leading `--`.
 * @returns The resolved `#rrggbb` value.
 */
function resolveToken(token: string): string {
  // The light `:root` block only — bounded so the dark overrides, which
  // redefine the same names, cannot be picked up instead. `@custom-variant`
  // near the top of the file also contains a `prefers-color-scheme` query, so
  // the start anchor has to be the light block itself.
  const from = GLOBALS.indexOf(':root {\n  color-scheme: light;');
  const to = GLOBALS.indexOf('@media (prefers-color-scheme: dark)', from);
  const root = GLOBALS.slice(from, to);
  let name = token;
  for (let hops = 0; hops < 10; hops += 1) {
    const match = new RegExp(`${name}:\\s*([^;]+);`).exec(root);
    if (!match) throw new Error(`token ${name} not found in :root`);
    const value = match[1].trim();
    if (value.startsWith('#')) return value;
    const indirect = /var\((--[a-z0-9-]+)\)/.exec(value);
    if (!indirect) throw new Error(`token ${name} resolves to a non-hex value: ${value}`);
    name = indirect[1];
  }
  throw new Error(`token ${token} did not resolve within 10 hops`);
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Max-minus-min channel spread, 0–1. A cheap, adequate saturation proxy. */
function chroma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...ch) - Math.min(...ch)) / 255;
}

describe('palette — near-monochrome plus one signal', () => {
  it('defines the approved named tokens in :root', () => {
    const expected: Array<[string, string]> = [
      ['--bg', '#ffffff'],
      ['--surface-2', '#f4f4f5'],
      ['--border', '#e5e5e7'],
      ['--border-strong', '#d2d3d6'],
      ['--text', '#111214'],
      ['--text-muted', '#6b6f76'],
      ['--text-subtle', '#8a8e96'],
      ['--signal', '#0f7b4a'],
      ['--signal-soft', '#e8f5ee'],
    ];
    for (const [token, value] of expected) {
      expect(GLOBALS).toContain(`${token}: ${value};`);
    }
  });

  it('mirrors the same values in the TypeScript token module', () => {
    expect(paper.base).toBe('#FFFFFF');
    expect(ink[900]).toBe('#111214');
    expect(ink[500]).toBe('#6B6F76');
    expect(ink[400]).toBe('#8A8E96');
    expect(ink[100]).toBe('#E5E5E7');
    expect(ink[50]).toBe('#F4F4F5');
    expect(mint[500]).toBe('#0F7B4A');
    expect(amber[500]).toBe('#B45309');
    expect(rose[500]).toBe('#B42318');
  });

  it('retires the vermilion ramp onto the neutrals rather than deleting it', () => {
    // Keeping the export is what stops unmigrated callers throwing; keeping it
    // CHROMATIC is what this test forbids.
    for (const shade of Object.values(ember)) {
      expect(Object.values(ink)).toContain(shade);
    }
  });

  it('leaves no ember hex anywhere in the marketing stylesheets', () => {
    const banned = /F94E1B|DC3A0C|B32D09|FF6F3D|FFF3EE|FFE1D5|FFC0A8|FF9871/i;
    for (const { file, css } of marketingStylesheets()) {
      expect({ file, hit: banned.test(css) }).toEqual({ file, hit: false });
    }
  });

  it('never reaches for an --ember-* or raw --ink-* variable from marketing CSS', () => {
    // Marketing components consume semantic tokens only. The raw ramps exist
    // for the semantic layer and for the decommission shim.
    for (const { file, css } of marketingStylesheets()) {
      const hits = css.match(/var\(--(?:ember|ink|paper)-[0-9a-z]+\)/g) ?? [];
      expect({ file, hits }).toEqual({ file, hits: [] });
    }
  });

  it('keeps the primary button on ink, where white clears AA by a wide margin', () => {
    expect(GLOBALS).toContain('--accent-solid: var(--text);');
    expect(GLOBALS).toContain('--accent-fg: #ffffff;');
  });

  /*
   * The generalised form of the rule, so it outlives the specific hexes banned
   * above. Whatever colour a future designer reaches for, if it is a solid fill
   * that carries a white label it has to clear 4.5:1 — the exact test the old
   * vermilion primary failed at 3.42:1.
   */
  it('clears AA for white text on every solid-fill token', () => {
    for (const token of SOLID_FILL_TOKENS) {
      const hex = resolveToken(token);
      expect({ token, hex, ratio: null }).toEqual({
        token,
        hex,
        ratio: null,
      });
      expect({ token, ok: contrast(hex, '#FFFFFF') >= 4.5 }).toEqual({ token, ok: true });
    }
  });

  it('demands headroom on solid fills, not bare compliance', () => {
    /*
     * The old vermilion primary was "fixed" by moving from `--ember-500`
     * (3.42:1, failing) to `--ember-600` (4.51:1) — a pass by 0.01. A palette
     * whose primary action needs that much care to stay legal is the wrong
     * palette, and the next well-meaning tweak breaks it again. Solid fills
     * carrying white must clear 5.0:1, so there is room to nudge a colour
     * without silently crossing the line.
     */
    for (const token of SOLID_FILL_TOKENS) {
      const hex = resolveToken(token);
      const ratio = Number(contrast(hex, '#FFFFFF').toFixed(2));
      expect({ token, hex, hasHeadroom: ratio >= 5 }).toEqual({ token, hex, hasHeadroom: true });
    }
  });

  it('keeps the primary action achromatic — that is the palette C decision', () => {
    // Green may be a fill (success), but the PRIMARY action must stay ink:
    // a chromatic primary is what the owner rejected.
    for (const token of ['--accent', '--accent-solid', '--accent-solid-hover'] as const) {
      const hex = resolveToken(token);
      expect({ token, hex, chroma: chroma(hex) < 0.05 }).toEqual({ token, hex, chroma: true });
    }
  });
});

describe('layout — one ground, one container, one left edge', () => {
  it('declares exactly one content container token', () => {
    expect(GLOBALS).toContain('--container-content: 1120px;');
  });

  it('hard-codes no bespoke container width in any marketing stylesheet', () => {
    // 940px / 960px / 720px used to be typed into three separate modules, which
    // moved the page's left edge 120 -> 250 -> 24 -> 360 -> 240 as you scrolled.
    for (const { file, css } of marketingStylesheets()) {
      if (file.endsWith('Section.module.css')) continue;
      // `(max-width: 899px)` is a breakpoint, not a container — only look at
      // declarations, which are preceded by whitespace rather than by `(`.
      const declarations = css.replace(/@media[^{]*\{/g, '');
      const widths = declarations.match(/max-width:\s*(?:9[0-9]{2}|[78][0-9]{2}|1[0-9]{3})px/g) ?? [];
      expect({ file, widths }).toEqual({ file, widths: [] });
    }
  });

  it('gives the shared Section the only max-width + gutter pair on the site', () => {
    expect(SECTION_CSS).toContain('max-width: var(--container-content);');
    expect(SECTION_CSS).toContain('padding-inline: var(--gutter);');
  });

  it('sources every section-scale block padding from the shared scale', () => {
    expect(SECTION_CSS).toContain('padding-block: var(--section-y);');
    for (const { file, css } of marketingStylesheets()) {
      if (file.endsWith('Section.module.css')) continue;
      // Only section-scale values are the concern: a fluid `clamp()` or
      // anything >= 32px is a section rhythm someone hand-rolled. Small
      // component-internal padding (a 10px connector gutter) is not.
      const bespoke = (css.match(/padding-block:\s*(?:clamp\([^)]*\)|(\d+)px)/g) ?? []).filter(
        (decl) => {
          const px = decl.match(/(\d+)px/);
          return px ? Number(px[1]) >= 32 : true;
        }
      );
      expect({ file, bespoke }).toEqual({ file, bespoke: [] });
    }
  });

  it('paints a background on exactly one section variant — the dark one', () => {
    // Sections are separated by whitespace and a 1px rule. `.dark` is the single
    // permitted inversion (pricing); anything else re-creates the banding.
    const grounds = SECTION_CSS.match(/^\s*background:.*$/gm) ?? [];
    expect(grounds).toHaveLength(1);
    expect(grounds[0]).toContain('#111214');
  });

  it('re-points the raw text tokens inside the dark block', () => {
    // Marketing modules read `var(--text)` directly. If the dark block only
    // overrode the semantic aliases, those elements rendered near-black on ink.
    expect(SECTION_CSS).toContain('--text: #ffffff;');
    expect(SECTION_CSS).toContain('--surface-raised: #202327;');
  });
});

describe('scroll reveals', () => {
  it('ships no Reveal component at all', () => {
    // The old one rendered 65 elements at `opacity: 0` in the server HTML, so
    // the whole page was blank without JS. It was removed rather than patched.
    expect(fs.existsSync(path.join(ROOT, 'src/components/marketing/parts/Reveal.tsx'))).toBe(false);
  });

  it('leaves no marketing component depending on framer-motion', () => {
    const walk = (dir: string): string[] => {
      const full = path.join(ROOT, dir);
      return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(rel);
        return /\.tsx?$/.test(entry.name) ? [rel] : [];
      });
    };
    for (const file of walk('src/components/marketing')) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect({ file, motion: src.includes('framer-motion') }).toEqual({ file, motion: false });
    }
  });
});
