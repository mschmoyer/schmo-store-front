/**
 * Color math for the storefront theme engine.
 *
 * Everything here is a pure function: same input, same output, no I/O, no clock,
 * no randomness. `resolve.ts` depends on that determinism so that `themeToCss`
 * output can be cached and diffed byte-for-byte.
 *
 * Two color spaces are implemented:
 *  - sRGB, for parsing/serialising hex and for WCAG relative luminance.
 *  - OKLab / OKLCh (Bjorn Ottosson), for perceptually even lightness and chroma
 *    manipulation. Deriving hover/active states and auto-contrast ink in OKLCh
 *    is what keeps a merchant's arbitrary brand color from looking broken.
 */

/** Straight sRGB triplet, each channel 0..255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCh triplet: lightness 0..1, chroma 0..~0.4, hue in degrees 0..360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** WCAG 2.x contrast target for normal-size body text. */
export const CONTRAST_TEXT = 4.5;
/** WCAG 2.x contrast target for large text, icons, borders and other non-text UI. */
export const CONTRAST_UI = 3;

const HEX_SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_LONG_ALPHA = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})[0-9a-f]{2}$/i;

/**
 * Clamp a number into an inclusive range.
 * @param value - Value to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * Parse a CSS hex color into an sRGB triplet.
 * Accepts `#abc`, `#aabbcc` and `#aabbccdd` (alpha ignored), with or without `#`.
 * @param hex - Hex color string
 * @returns The parsed sRGB triplet, or null when the string is not a hex color
 */
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  const value = hex.trim();

  const short = HEX_SHORT.exec(value);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const long = HEX_LONG.exec(value);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }

  const withAlpha = HEX_LONG_ALPHA.exec(value);
  if (withAlpha) {
    return {
      r: parseInt(withAlpha[1], 16),
      g: parseInt(withAlpha[2], 16),
      b: parseInt(withAlpha[3], 16),
    };
  }

  return null;
}

/**
 * Test whether a string is a color the engine can do math on.
 * @param hex - Candidate color string
 * @returns True when the value parses as a hex color
 */
export function isHexColor(hex: string): boolean {
  return parseHex(hex) !== null;
}

/**
 * Serialise an sRGB triplet as a lowercase 6-digit hex string.
 * @param rgb - sRGB triplet (channels are rounded and clamped)
 * @returns Hex string such as `#f94e1b`
 */
export function toHex(rgb: Rgb): string {
  const part = (n: number): string =>
    Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/**
 * Convert one gamma-encoded sRGB channel (0..1) to linear light.
 * @param channel - Channel value 0..1
 * @returns Linear-light channel value
 */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Convert one linear-light channel to gamma-encoded sRGB (0..1).
 * @param channel - Linear-light channel value
 * @returns Gamma-encoded channel value 0..1
 */
function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/**
 * WCAG 2.x relative luminance of an sRGB color.
 * @param rgb - sRGB triplet
 * @returns Relative luminance 0..1
 */
export function relativeLuminance(rgb: Rgb): number {
  const r = srgbToLinear(clamp(rgb.r, 0, 255) / 255);
  const g = srgbToLinear(clamp(rgb.g, 0, 255) / 255);
  const b = srgbToLinear(clamp(rgb.b, 0, 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two hex colors.
 * @param a - First color (hex)
 * @param b - Second color (hex)
 * @returns Contrast ratio between 1 and 21; 1 when either color is unparseable
 */
export function contrastRatio(a: string, b: string): number {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);
  if (!rgbA || !rgbB) return 1;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Convert sRGB to OKLab.
 * @param rgb - sRGB triplet
 * @returns OKLab components
 */
function rgbToOklab(rgb: Rgb): { L: number; a: number; b: number } {
  const r = srgbToLinear(clamp(rgb.r, 0, 255) / 255);
  const g = srgbToLinear(clamp(rgb.g, 0, 255) / 255);
  const b = srgbToLinear(clamp(rgb.b, 0, 255) / 255);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/**
 * Convert OKLab back to linear-light RGB (may fall outside 0..1 = out of gamut).
 * @param lab - OKLab components
 * @returns Linear-light RGB channels
 */
function oklabToLinearRgb(lab: { L: number; a: number; b: number }): {
  r: number;
  g: number;
  b: number;
} {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/**
 * Test whether an OKLCh color fits inside the sRGB gamut.
 * @param oklch - OKLCh triplet
 * @returns True when every linear channel lands within [0, 1] (with epsilon)
 */
function inSrgbGamut(oklch: Oklch): boolean {
  const hueRad = (oklch.h * Math.PI) / 180;
  const lin = oklabToLinearRgb({
    L: oklch.l,
    a: oklch.c * Math.cos(hueRad),
    b: oklch.c * Math.sin(hueRad),
  });
  const eps = 1e-4;
  return (
    lin.r >= -eps && lin.r <= 1 + eps &&
    lin.g >= -eps && lin.g <= 1 + eps &&
    lin.b >= -eps && lin.b <= 1 + eps
  );
}

/**
 * Convert a hex color to OKLCh.
 * @param hex - Hex color string
 * @param fallback - Value returned when `hex` cannot be parsed
 * @returns OKLCh triplet
 */
export function hexToOklch(hex: string, fallback: Oklch = { l: 0, c: 0, h: 0 }): Oklch {
  const rgb = parseHex(hex);
  if (!rgb) return { ...fallback };
  const lab = rgbToOklab(rgb);
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Hue is meaningless at zero chroma; pin it so output stays deterministic.
  return { l: lab.L, c, h: c < 1e-6 ? 0 : h };
}

/**
 * Convert OKLCh to the nearest in-gamut sRGB hex color.
 *
 * Out-of-gamut colors are gamut-mapped by binary-searching chroma downward at
 * constant lightness and hue, which preserves the perceived "shade" far better
 * than naive channel clipping.
 *
 * @param oklch - OKLCh triplet
 * @returns Lowercase hex string
 */
export function oklchToHex(oklch: Oklch): string {
  const l = clamp(oklch.l, 0, 1);
  const h = ((oklch.h % 360) + 360) % 360;
  let c = Math.max(0, oklch.c);

  if (!inSrgbGamut({ l, c, h })) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inSrgbGamut({ l, c: mid, h })) {
        low = mid;
      } else {
        high = mid;
      }
    }
    c = low;
  }

  const hueRad = (h * Math.PI) / 180;
  const lin = oklabToLinearRgb({
    L: l,
    a: c * Math.cos(hueRad),
    b: c * Math.sin(hueRad),
  });

  return toHex({
    r: linearToSrgb(clamp(lin.r, 0, 1)) * 255,
    g: linearToSrgb(clamp(lin.g, 0, 1)) * 255,
    b: linearToSrgb(clamp(lin.b, 0, 1)) * 255,
  });
}

/**
 * Round-trip a color through OKLCh, applying a transform to the components.
 * Unparseable input is returned untouched so callers never emit `NaN`.
 * @param hex - Source hex color
 * @param transform - Mutation applied to the OKLCh triplet
 * @returns Transformed hex color
 */
export function withOklch(hex: string, transform: (oklch: Oklch) => Oklch): string {
  if (!isHexColor(hex)) return hex;
  return oklchToHex(transform(hexToOklch(hex)));
}

/**
 * Shift a color's perceptual lightness.
 * @param hex - Source hex color
 * @param delta - Lightness delta in OKLCh units (roughly -1..1)
 * @returns Adjusted hex color
 */
export function adjustLightness(hex: string, delta: number): string {
  return withOklch(hex, (o) => ({ ...o, l: clamp(o.l + delta, 0, 1) }));
}

/**
 * Scale a color's chroma (saturation).
 * @param hex - Source hex color
 * @param factor - Multiplier applied to chroma
 * @returns Adjusted hex color
 */
export function adjustChroma(hex: string, factor: number): string {
  return withOklch(hex, (o) => ({ ...o, c: Math.max(0, o.c * factor) }));
}

/**
 * Blend two colors in OKLab, which avoids the muddy midpoints of sRGB mixing.
 * @param a - First hex color
 * @param b - Second hex color
 * @param amount - 0 returns `a`, 1 returns `b`
 * @returns Mixed hex color
 */
export function mix(a: string, b: string, amount: number): string {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);
  if (!rgbA || !rgbB) return a;
  const t = clamp(amount, 0, 1);
  const labA = rgbToOklab(rgbA);
  const labB = rgbToOklab(rgbB);
  const lab = {
    L: labA.L + (labB.L - labA.L) * t,
    a: labA.a + (labB.a - labA.a) * t,
    b: labA.b + (labB.b - labA.b) * t,
  };
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return oklchToHex({ l: lab.L, c, h: c < 1e-6 ? 0 : h });
}

/**
 * True when a color reads as "dark" (its perceptual lightness is below mid).
 * @param hex - Hex color
 * @returns True for dark colors
 */
export function isDark(hex: string): boolean {
  return hexToOklch(hex).l < 0.55;
}

/**
 * The lowest contrast ratio between a foreground and a set of backgrounds.
 * @param fg - Foreground hex color
 * @param backgrounds - Background hex colors the foreground must survive
 * @returns Worst-case contrast ratio
 */
export function worstContrast(fg: string, backgrounds: readonly string[]): number {
  if (backgrounds.length === 0) return 21;
  return backgrounds.reduce(
    (worst, bg) => Math.min(worst, contrastRatio(fg, bg)),
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Push a foreground color along the lightness axis until it clears a contrast
 * target against every supplied background.
 *
 * The direction is chosen once, up-front, from the mean lightness of the
 * backgrounds: on dark grounds we brighten, on light grounds we darken. Chroma
 * is eased out as we approach the extremes so a saturated color does not turn
 * into a neon smear at L=0.05.
 *
 * @param fg - Foreground hex color to adjust
 * @param backgrounds - Backgrounds the foreground must be legible on
 * @param target - Minimum WCAG contrast ratio to reach
 * @returns A hex color meeting the target where sRGB allows, otherwise the best attempt
 */
export function ensureContrast(
  fg: string,
  backgrounds: readonly string[],
  target: number = CONTRAST_TEXT,
): string {
  if (!isHexColor(fg)) return fg;
  const grounds = backgrounds.filter(isHexColor);
  if (grounds.length === 0) return fg;
  if (worstContrast(fg, grounds) >= target) return fg;

  const meanGroundL =
    grounds.reduce((sum, bg) => sum + hexToOklch(bg).l, 0) / grounds.length;
  const goLighter = meanGroundL < 0.5;
  const base = hexToOklch(fg);

  let best = fg;
  let bestRatio = worstContrast(fg, grounds);

  const STEPS = 100;
  for (let i = 1; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const l = goLighter
      ? clamp(base.l + (1 - base.l) * t, 0, 1)
      : clamp(base.l * (1 - t), 0, 1);
    // Ease chroma out near the extremes so we do not produce neon ink.
    const headroom = goLighter ? 1 - l : l;
    const c = Math.min(base.c, base.c * clamp(headroom / 0.35, 0, 1));
    const candidate = oklchToHex({ l, c, h: base.h });
    const ratio = worstContrast(candidate, grounds);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
    if (ratio >= target) return candidate;
  }

  return best;
}

/**
 * Pick the ink that sits legibly on top of one or more brand backgrounds.
 *
 * This is the auto-contrast rule the theme contract calls out as the single most
 * important job of the engine. A pale yellow brand yields dark ink; a near-black
 * brand yields near-white ink; and the winner is verified against *every* brand
 * state (base, hover, active) so a button does not become unreadable on press.
 *
 * @param backgrounds - Brand backgrounds the ink must survive (base/hover/active)
 * @param darkInk - Preferred dark candidate, usually derived from the theme text color
 * @param lightInk - Preferred light candidate, usually derived from the raised surface
 * @param target - Minimum contrast ratio, defaults to 4.5:1
 * @returns A hex ink color meeting the target
 */
export function pickOnColor(
  backgrounds: readonly string[],
  darkInk: string,
  lightInk: string,
  target: number = CONTRAST_TEXT,
): string {
  const grounds = backgrounds.filter(isHexColor);
  if (grounds.length === 0) return darkInk;

  const darkRatio = worstContrast(darkInk, grounds);
  const lightRatio = worstContrast(lightInk, grounds);

  // Prefer a candidate that already passes; otherwise start from whichever is closer.
  if (darkRatio >= target && darkRatio >= lightRatio) return darkInk;
  if (lightRatio >= target) return lightInk;

  const seed = darkRatio >= lightRatio ? darkInk : lightInk;
  const pushed = ensureContrast(seed, grounds, target);
  if (worstContrast(pushed, grounds) >= target) return pushed;

  // Last resort: pure black or pure white, whichever wins. One of these always
  // clears 4.5:1 for mid-lightness grounds, and is the maximum sRGB can offer.
  const black = '#000000';
  const white = '#ffffff';
  return worstContrast(black, grounds) >= worstContrast(white, grounds) ? black : white;
}

/**
 * Derive the pressed/hovered variants of a brand color.
 *
 * The direction of travel is chosen so the state change is always *visible*
 * against the page: a light brand darkens, a dark brand lightens. Chroma is
 * nudged up slightly on hover so the color reads as more "active", not just dimmer.
 *
 * @param brand - Brand hex color
 * @param surface - Page ground the brand sits on
 * @returns Hover and active hex colors
 */
export function deriveBrandStates(
  brand: string,
  surface: string,
): { hover: string; active: string } {
  if (!isHexColor(brand)) return { hover: brand, active: brand };
  const base = hexToOklch(brand);
  const surfaceL = isHexColor(surface) ? hexToOklch(surface).l : 1;

  // Move away from the page ground; near the ends of the range, reverse so the
  // state does not clip into a flat black or flat white.
  let lighten = surfaceL > 0.5 ? false : true;
  if (base.l < 0.22) lighten = true;
  if (base.l > 0.9) lighten = false;

  const step = 0.055;
  const dir = lighten ? 1 : -1;

  const hover = oklchToHex({
    l: clamp(base.l + dir * step, 0.04, 0.97),
    c: base.c * 1.03,
    h: base.h,
  });
  const active = oklchToHex({
    l: clamp(base.l + dir * step * 2, 0.03, 0.98),
    c: base.c * 1.05,
    h: base.h,
  });

  return { hover, active };
}

/**
 * Derive a hairline that is actually visible against a surface.
 *
 * Merchant-picked borders are frequently too faint to see. `--st-border-strong`
 * is pushed toward the text color until it clears the 3:1 non-text contrast floor.
 *
 * @param border - Merchant's border color
 * @param surface - Ground the border is drawn on
 * @param text - Text color, used as the direction to travel
 * @returns A hex border color with at least 3:1 against the surface
 */
export function deriveStrongBorder(border: string, surface: string, text: string): string {
  if (!isHexColor(border)) return border;
  const seed = isHexColor(text) ? mix(border, text, 0.45) : border;
  return ensureContrast(seed, [surface], CONTRAST_UI);
}

/**
 * Derive the near-black used to tint shadows and overlays.
 *
 * Rather than a flat `rgba(0,0,0,x)`, shadows inherit the hue of the merchant's
 * surface at very low lightness, which is what makes warm themes feel warm all
 * the way down into their elevation.
 *
 * @param surface - Page ground color
 * @returns sRGB triplet suitable for `rgba(...)` shadow tints
 */
export function deriveShadowTint(surface: string): Rgb {
  const base = isHexColor(surface) ? hexToOklch(surface) : { l: 1, c: 0, h: 0 };
  const tint = oklchToHex({ l: 0.16, c: Math.min(base.c, 0.035), h: base.h });
  return parseHex(tint) ?? { r: 16, g: 18, b: 22 };
}

/**
 * Format an sRGB triplet plus alpha as a deterministic `rgba()` string.
 * @param rgb - sRGB triplet
 * @param alpha - Alpha 0..1
 * @returns `rgba(r, g, b, a)`
 */
export function rgba(rgb: Rgb, alpha: number): string {
  const a = Math.round(clamp(alpha, 0, 1) * 1000) / 1000;
  return `rgba(${Math.round(clamp(rgb.r, 0, 255))}, ${Math.round(
    clamp(rgb.g, 0, 255),
  )}, ${Math.round(clamp(rgb.b, 0, 255))}, ${a})`;
}
