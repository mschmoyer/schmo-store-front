/**
 * Zod schema tests — the API boundary's only defence against untrusted input.
 */

import {
  MAX_CUSTOM_CSS_LENGTH,
  MAX_SECTIONS_PER_PAGE,
  saveDraftBodySchema,
  sectionSchema,
  sectionsSchema,
  storefrontThemeInputSchema,
} from '../types';

describe('storefrontThemeInputSchema', () => {
  it('accepts an empty patch', () => {
    expect(storefrontThemeInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a deep partial patch', () => {
    expect(storefrontThemeInputSchema.safeParse({ brand: { color: '#ff0000' } }).success).toBe(true);
    expect(storefrontThemeInputSchema.safeParse({ typography: { scale: 'compact' } }).success).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    expect(storefrontThemeInputSchema.safeParse({ nope: 1 }).success).toBe(false);
  });

  it('rejects unknown nested keys', () => {
    expect(storefrontThemeInputSchema.safeParse({ brand: { colour: '#ff0000' } }).success).toBe(false);
  });

  it('rejects non-hex colours, including CSS functions and injection attempts', () => {
    for (const color of ['red', 'rgb(1,2,3)', 'var(--x)', '#12', 'url(x)', '} body {']) {
      expect(storefrontThemeInputSchema.safeParse({ brand: { color } }).success).toBe(false);
    }
  });

  it('accepts 3, 6 and 8 digit hex', () => {
    for (const color of ['#abc', '#aabbcc', '#aabbccdd']) {
      expect(storefrontThemeInputSchema.safeParse({ brand: { color } }).success).toBe(true);
    }
  });

  it('rejects enum values outside the contract', () => {
    expect(storefrontThemeInputSchema.safeParse({ shape: { radius: 'blobby' } }).success).toBe(false);
    expect(storefrontThemeInputSchema.safeParse({ shape: { borderWidth: 7 } }).success).toBe(false);
    expect(storefrontThemeInputSchema.safeParse({ typography: { headingWeight: 450 } }).success).toBe(false);
    expect(storefrontThemeInputSchema.safeParse({ typography: { headingFont: 'comic-sans' } }).success).toBe(false);
  });

  it('bounds heading tracking', () => {
    expect(storefrontThemeInputSchema.safeParse({ typography: { headingTracking: 0.03 } }).success).toBe(true);
    expect(storefrontThemeInputSchema.safeParse({ typography: { headingTracking: 0.5 } }).success).toBe(false);
  });

  it('rejects a version other than 1', () => {
    expect(storefrontThemeInputSchema.safeParse({ version: 2 }).success).toBe(false);
  });

  it('caps custom CSS length', () => {
    const tooLong = 'a'.repeat(MAX_CUSTOM_CSS_LENGTH + 1);
    expect(storefrontThemeInputSchema.safeParse({ custom: { css: tooLong } }).success).toBe(false);
  });

  it('reports a usable path for a nested failure', () => {
    const result = storefrontThemeInputSchema.safeParse({ brand: { color: 'red' } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['brand', 'color']);
  });
});

describe('sectionSchema / sectionsSchema', () => {
  it('accepts a well-formed section', () => {
    expect(
      sectionSchema.safeParse({ id: 'hero-1', type: 'hero', enabled: true, settings: {} }).success,
    ).toBe(true);
  });

  it('rejects unknown section types', () => {
    expect(
      sectionSchema.safeParse({ id: 'x', type: 'carousel-3000', enabled: true, settings: {} }).success,
    ).toBe(false);
  });

  it('rejects ids that could be injected into a selector or the DOM', () => {
    for (const id of ['a b', 'a"b', '<script>', 'a.b', '']) {
      expect(sectionSchema.safeParse({ id, type: 'hero', enabled: true, settings: {} }).success).toBe(false);
    }
  });

  it('rejects duplicate ids in a list', () => {
    const result = sectionsSchema.safeParse([
      { id: 'a', type: 'hero', enabled: true, settings: {} },
      { id: 'a', type: 'faq', enabled: true, settings: {} },
    ]);
    expect(result.success).toBe(false);
  });

  it('caps the number of sections', () => {
    const many = Array.from({ length: MAX_SECTIONS_PER_PAGE + 1 }, (_, i) => ({
      id: `s${i}`,
      type: 'hero',
      enabled: true,
      settings: {},
    }));
    expect(sectionsSchema.safeParse(many).success).toBe(false);
  });
});

describe('saveDraftBodySchema', () => {
  it('accepts theme only, sections only, or both', () => {
    expect(saveDraftBodySchema.safeParse({ theme: {} }).success).toBe(true);
    expect(saveDraftBodySchema.safeParse({ sections: [] }).success).toBe(true);
    expect(saveDraftBodySchema.safeParse({ theme: {}, sections: [] }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(saveDraftBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra keys', () => {
    expect(saveDraftBodySchema.safeParse({ theme: {}, storeId: 'someone-elses' }).success).toBe(false);
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, 'x', 5, []]) {
      expect(saveDraftBodySchema.safeParse(body).success).toBe(false);
    }
  });
});
