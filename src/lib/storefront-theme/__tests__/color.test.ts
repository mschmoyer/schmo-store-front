/**
 * Colour-math tests.
 *
 * The auto-contrast rule is the single most important thing the engine does, so
 * these tests are deliberately adversarial about brand colours: pale yellow,
 * near-black, neon, pure white, pure black and a sweep of the whole hue circle.
 */

import {
  contrastRatio,
  deriveBrandStates,
  deriveShadowTint,
  deriveStrongBorder,
  ensureContrast,
  hexToOklch,
  isDark,
  mix,
  oklchToHex,
  parseHex,
  pickOnColor,
  relativeLuminance,
  rgba,
  toHex,
  worstContrast,
} from '../color';

describe('parseHex / toHex', () => {
  it('parses long, short and alpha hex, with and without #', () => {
    expect(parseHex('#f94e1b')).toEqual({ r: 249, g: 78, b: 27 });
    expect(parseHex('f94e1b')).toEqual({ r: 249, g: 78, b: 27 });
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHex('#f94e1bff')).toEqual({ r: 249, g: 78, b: 27 });
  });

  it('rejects anything that is not a hex colour', () => {
    for (const value of ['', 'red', 'rgb(1,2,3)', '#gggggg', '#12345', 'var(--x)']) {
      expect(parseHex(value)).toBeNull();
    }
  });

  it('round-trips through toHex', () => {
    for (const hex of ['#000000', '#ffffff', '#f94e1b', '#0fa871', '#123456']) {
      expect(toHex(parseHex(hex)!)).toBe(hex);
    }
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#f94e1b', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#f94e1b'),
      6,
    );
  });

  it('agrees with the design system: ember on white is about 3.4:1', () => {
    expect(contrastRatio('#f94e1b', '#ffffff')).toBeGreaterThan(3.2);
    expect(contrastRatio('#f94e1b', '#ffffff')).toBeLessThan(3.6);
  });

  it('returns 1 for unparseable input rather than NaN', () => {
    expect(contrastRatio('nope', '#ffffff')).toBe(1);
  });
});

describe('OKLCh conversion', () => {
  it('round-trips in-gamut colours to within one 8-bit step', () => {
    const samples = ['#f94e1b', '#0fa871', '#2563eb', '#c6f135', '#8a6a4f', '#111111', '#fbfaf8'];
    for (const hex of samples) {
      const back = oklchToHex(hexToOklch(hex));
      const a = parseHex(hex)!;
      const b = parseHex(back)!;
      expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(1);
    }
  });

  it('pins hue at zero chroma so output stays deterministic', () => {
    expect(hexToOklch('#808080').h).toBe(0);
    expect(hexToOklch('#ffffff').c).toBeLessThan(0.001);
  });

  it('gamut-maps out-of-range chroma instead of clipping channels', () => {
    // Chroma 0.4 at L=0.5 is far outside sRGB for most hues.
    const mapped = oklchToHex({ l: 0.5, c: 0.4, h: 140 });
    expect(parseHex(mapped)).not.toBeNull();
    const back = hexToOklch(mapped);
    expect(back.l).toBeCloseTo(0.5, 1);
    expect(back.c).toBeLessThan(0.4);
  });

  it('is deterministic', () => {
    expect(oklchToHex({ l: 0.62, c: 0.19, h: 33 })).toBe(oklchToHex({ l: 0.62, c: 0.19, h: 33 }));
  });
});

describe('mix', () => {
  it('returns the endpoints exactly', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('produces a perceptual midpoint lighter than the sRGB average', () => {
    const midpoint = mix('#000000', '#ffffff', 0.5);
    const l = hexToOklch(midpoint).l;
    expect(l).toBeGreaterThan(0.45);
    expect(l).toBeLessThan(0.55);
  });
});

describe('isDark', () => {
  it('classifies obvious cases', () => {
    expect(isDark('#000000')).toBe(true);
    expect(isDark('#08090b')).toBe(true);
    expect(isDark('#ffffff')).toBe(false);
    expect(isDark('#c6f135')).toBe(false);
  });
});

describe('ensureContrast', () => {
  it('leaves a colour alone when it already passes', () => {
    expect(ensureContrast('#000000', ['#ffffff'], 4.5)).toBe('#000000');
  });

  it('darkens on light grounds and lightens on dark grounds', () => {
    const onLight = ensureContrast('#bbbbbb', ['#ffffff'], 4.5);
    expect(contrastRatio(onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(hexToOklch(onLight).l).toBeLessThan(hexToOklch('#bbbbbb').l);

    const onDark = ensureContrast('#444444', ['#000000'], 4.5);
    expect(contrastRatio(onDark, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(hexToOklch(onDark).l).toBeGreaterThan(hexToOklch('#444444').l);
  });

  it('satisfies every background at once', () => {
    const grounds = ['#ffffff', '#f2f1ed', '#e7e0d5'];
    const fixed = ensureContrast('#cccccc', grounds, 4.5);
    expect(worstContrast(fixed, grounds)).toBeGreaterThanOrEqual(4.5);
  });

  it('never returns NaN or an invalid colour for unparseable input', () => {
    expect(ensureContrast('not-a-color', ['#ffffff'], 4.5)).toBe('not-a-color');
  });
});

describe('pickOnColor — the auto-contrast rule', () => {
  const darkInk = '#0e1014';
  const lightInk = '#ffffff';

  it('puts dark ink on a pale yellow brand', () => {
    const on = pickOnColor(['#fff59d'], darkInk, lightInk);
    expect(contrastRatio(on, '#fff59d')).toBeGreaterThanOrEqual(4.5);
    expect(isDark(on)).toBe(true);
  });

  it('puts white ink on a near-black brand', () => {
    const on = pickOnColor(['#111111'], darkInk, lightInk);
    expect(contrastRatio(on, '#111111')).toBeGreaterThanOrEqual(4.5);
    expect(isDark(on)).toBe(false);
  });

  it('puts dark ink on the Voltage acid lime', () => {
    const on = pickOnColor(['#c6f135'], darkInk, lightInk);
    expect(contrastRatio(on, '#c6f135')).toBeGreaterThanOrEqual(4.5);
    expect(isDark(on)).toBe(true);
  });

  it('handles pure white and pure black brands', () => {
    expect(contrastRatio(pickOnColor(['#ffffff'], darkInk, lightInk), '#ffffff'))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pickOnColor(['#000000'], darkInk, lightInk), '#000000'))
      .toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 for a full sweep of hues at every lightness', () => {
    const failures: string[] = [];
    for (let h = 0; h < 360; h += 7) {
      for (let l = 0.05; l <= 0.98; l += 0.05) {
        for (const c of [0, 0.08, 0.16, 0.26]) {
          const brand = oklchToHex({ l, c, h });
          const on = pickOnColor([brand], darkInk, lightInk);
          const ratio = contrastRatio(on, brand);
          if (ratio < 4.5) failures.push(`${brand} -> ${on} (${ratio.toFixed(2)}:1)`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('stays legible across the brand, hover and active states together', () => {
    const failures: string[] = [];
    for (let h = 0; h < 360; h += 11) {
      for (let l = 0.1; l <= 0.95; l += 0.07) {
        const brand = oklchToHex({ l, c: 0.14, h });
        const { hover, active } = deriveBrandStates(brand, '#ffffff');
        const on = pickOnColor([brand, hover, active], darkInk, lightInk);
        const ratio = worstContrast(on, [brand, hover, active]);
        if (ratio < 4.5) failures.push(`${brand} -> ${on} (${ratio.toFixed(2)}:1)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('is deterministic', () => {
    expect(pickOnColor(['#f94e1b'], darkInk, lightInk)).toBe(
      pickOnColor(['#f94e1b'], darkInk, lightInk),
    );
  });
});

describe('deriveBrandStates', () => {
  it('darkens a mid brand on a light ground', () => {
    const { hover, active } = deriveBrandStates('#2563eb', '#ffffff');
    expect(hexToOklch(hover).l).toBeLessThan(hexToOklch('#2563eb').l);
    expect(hexToOklch(active).l).toBeLessThan(hexToOklch(hover).l);
  });

  it('lightens a brand on a dark ground', () => {
    const { hover, active } = deriveBrandStates('#3b6fd4', '#08090b');
    expect(hexToOklch(hover).l).toBeGreaterThan(hexToOklch('#3b6fd4').l);
    expect(hexToOklch(active).l).toBeGreaterThan(hexToOklch(hover).l);
  });

  it('reverses direction at the extremes so states never flatten out', () => {
    const nearBlack = deriveBrandStates('#050505', '#ffffff');
    expect(hexToOklch(nearBlack.hover).l).toBeGreaterThan(hexToOklch('#050505').l);

    const nearWhite = deriveBrandStates('#fdfdfd', '#111111');
    expect(hexToOklch(nearWhite.hover).l).toBeLessThan(hexToOklch('#fdfdfd').l);
  });

  it('always produces a visibly different hover state', () => {
    for (let h = 0; h < 360; h += 30) {
      const brand = oklchToHex({ l: 0.6, c: 0.15, h });
      const { hover } = deriveBrandStates(brand, '#ffffff');
      expect(hover).not.toBe(brand);
    }
  });
});

describe('deriveStrongBorder', () => {
  it('lifts an invisible hairline to the 3:1 non-text floor', () => {
    const strong = deriveStrongBorder('#fdfdfd', '#ffffff', '#0e1014');
    expect(contrastRatio(strong, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('works on dark grounds too', () => {
    const strong = deriveStrongBorder('#0a0b0d', '#08090b', '#f2f4f7');
    expect(contrastRatio(strong, '#08090b')).toBeGreaterThanOrEqual(3);
  });
});

describe('deriveShadowTint / rgba', () => {
  it('produces a near-black that inherits the surface hue', () => {
    const warm = deriveShadowTint('#faf7f2');
    const cool = deriveShadowTint('#f0f4ff');
    expect(warm).not.toEqual(cool);
    expect(relativeLuminance(warm)).toBeLessThan(0.05);
  });

  it('formats rgba deterministically and clamps alpha', () => {
    expect(rgba({ r: 16, g: 18, b: 22 }, 0.06)).toBe('rgba(16, 18, 22, 0.06)');
    expect(rgba({ r: 300, g: -5, b: 22 }, 5)).toBe('rgba(255, 0, 22, 1)');
  });
});
