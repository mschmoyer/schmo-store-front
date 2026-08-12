/**
 * Guards the one unavoidable duplication in the font layer.
 *
 * `next/font/google` is a build-time macro whose options must be explicitly
 * written literals — passing `FONTS[id].cssVar` to `variable:` fails compilation
 * of the entire application with "Font loader values must be explicitly written
 * literals". So the CSS variable names are typed out by hand in `fonts.next.ts`
 * and therefore can drift from the `FONTS` registry that everything else reads.
 *
 * If they drift, nothing throws: `themeToCss` emits `var(--st-font-lora)`, the
 * loader defined `--st-font-lorra`, and the storefront quietly renders in a
 * fallback face. That is exactly the class of bug a test should catch.
 */
import { FONTS } from '../fonts';
import { FONT_IDS, type FontId } from '../types';
import { DECLARED_FONT_CSS_VARS } from '../fonts.next';

describe('next/font declarations match the curated registry', () => {
  it('declares a CSS variable for every curated font', () => {
    expect(Object.keys(DECLARED_FONT_CSS_VARS).sort()).toEqual([...FONT_IDS].sort());
  });

  it.each([...FONT_IDS])('%s resolves to the registry cssVar', (id) => {
    const fontId = id as FontId;
    expect(DECLARED_FONT_CSS_VARS[fontId]).toBe(FONTS[fontId].cssVar);
  });

  it('uses a distinct variable per font', () => {
    const values = Object.values(DECLARED_FONT_CSS_VARS);
    expect(new Set(values).size).toBe(values.length);
  });
});
