/**
 * Deterministic generated product marks.
 *
 * WHY THIS IS ITS OWN MODULE — do not fold it back into `ProductImage.tsx`.
 *
 * `ProductImage.tsx` carries a `'use client'` directive, and Next.js turns
 * *every* export of a client module into a client reference. That made
 * `getProductMark` uncallable from a server component: the storefront's
 * `ProductCard` imported it and every store page returned a 500 with
 *
 *   Attempted to call getProductMark() from the server but getProductMark is on
 *   the client.
 *
 * The logic itself is pure and has no browser dependency, so it belongs on the
 * server side of the boundary. `ProductImage.tsx` re-exports it for backwards
 * compatibility; server components should import from here directly.
 */
import { gradientForSeed, hashString } from './tokens';

/** A deterministic placeholder tile derived from a product's SKU or name. */
export interface ProductMark {
  /** One or two uppercase characters taken from the product name. */
  initials: string;
  /** CSS gradient for the tile background. */
  gradient: string;
  /** Foreground colour that stays legible on the gradient. */
  foreground: string;
  /** Highlight position, as CSS percentages. */
  glow: { x: string; y: string };
  /** Angle of the weave overlay. */
  weaveAngle: string;
  /** A tiny SVG data URI used as the blur-up placeholder. */
  blurDataURL: string;
  /**
   * True when the initials fall outside the Latin script. Space Grotesk is
   * loaded `subsets: ['latin']`, so a CJK or Arabic mark would silently swap to
   * a system face mid-grid. The tile renders these in Inter instead, which
   * ships far broader coverage — a deliberate second face, not an accident.
   */
  nonLatin: boolean;
  /** True when only one glyph was derived; the tile sizes it up optically. */
  single: boolean;
}

/**
 * Derives up to two initials from a product name, falling back to the SKU.
 *
 * Commerce names lead with digits far more often than you would guess — "3M
 * Command Hooks", "24kg Cast Iron Kettlebell", "#1 Best Seller Mug", "5-Pack".
 * A numeric initial reads as noise, so words that *start with a letter* win;
 * digits are only used when the name contains no letters at all.
 *
 * @param name - Product name, may be undefined.
 * @param sku - Product SKU, used when the name yields nothing usable.
 * @returns One or two uppercase characters, or `??` when neither input helps.
 */
export function deriveInitials(name: string | undefined, sku: string | undefined): string {
  const words = (name ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const letterWords = words.filter((word) => /^\p{L}/u.test(word));
  const source = letterWords.length > 0 ? letterWords : words;

  if (source.length >= 2) {
    return (source[0][0] + source[1][0]).toUpperCase();
  }
  if (source.length === 1) {
    // One short word gives one glyph rather than an awkward half-full pair.
    return source[0].slice(0, source[0].length > 2 ? 2 : 1).toUpperCase();
  }

  const skuChars = (sku ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  return (skuChars.slice(0, 2) || '??').toUpperCase();
}

/**
 * Builds the deterministic generated mark for a product. The same SKU always
 * produces the same tile, on the server and on the client, so a catalogue does
 * not reshuffle its colours between renders.
 *
 * @param options - The product's `sku` and/or `name`. SKU is preferred as the seed.
 * @returns A {@link ProductMark} describing the tile.
 */
export function getProductMark(options: { sku?: string; name?: string }): ProductMark {
  const seed = (options.sku || options.name || 'rebelshops').trim().toLowerCase();
  const hash = hashString(seed);
  const { from, to, on } = gradientForSeed(seed);

  // Spread the derived numbers across different bit ranges so angle, glow and
  // weave do not all move in lockstep with the palette choice.
  const angle = 90 + ((hash >>> 4) % 8) * 22.5;
  const glowX = 18 + ((hash >>> 9) % 5) * 16;
  const glowY = 14 + ((hash >>> 14) % 4) * 18;
  const weaveAngle = ((hash >>> 19) % 2 === 0 ? 45 : 135) + ((hash >>> 21) % 3) * 5;

  const gradient = `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
    + `</linearGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>`;

  const initials = deriveInitials(options.name, options.sku);

  return {
    initials,
    gradient,
    foreground: on,
    glow: { x: `${glowX}%`, y: `${glowY}%` },
    weaveAngle: `${weaveAngle}deg`,
    blurDataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    nonLatin: /\p{L}/u.test(initials) && !/\p{Script=Latin}/u.test(initials),
    single: [...initials].length === 1,
  };
}
