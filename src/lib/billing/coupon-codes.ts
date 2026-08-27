/**
 * Platform coupon code generation.
 *
 * These codes get texted to a friend, read aloud, or copied off a whiteboard, so the alphabet is
 * Crockford-*ish*: uppercase letters and digits, with `0`, `O`, `1`, `I`, `L` removed because they
 * are genuinely ambiguous in those situations (a `0` and an `O` are indistinguishable read aloud in
 * a generic sans-serif UI; `1`, `I` and `l` collide in plenty of fonts and in handwriting). Real
 * Crockford base32 keeps `0` and `1` as digits and only drops `I`, `L`, `O`, `U`; this alphabet
 * drops one more pair of digits than that scheme does, on purpose, because the reading-aloud case
 * matters more here than squeezing out the last bit of density. Removing five characters from the
 * 36-character `[0-9A-Z]` pool leaves 31 symbols: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
 *
 * **Entropy per code:** log2(31) ≈ 4.95 bits per character — see {@link bitsPerCharacter}. The
 * default length is 10, giving ≈49.5 bits of entropy (31^10 ≈ 8.2 * 10^14 possible codes) —
 * comfortably beyond what online guessing through a rate-limited endpoint (`/join/[code]`,
 * `/api/billing/coupon/preview`, per §9 of the plan) can exhaust, while still short enough to read
 * out over the phone.
 *
 * Generation uses `node:crypto`'s CSPRNG (`randomInt`), never `Math.random`, because a coupon
 * worth up to a year of the product is a credential, not a UI nicety.
 */

import { randomInt } from 'node:crypto';

/**
 * The alphabet codes are drawn from: uppercase Crockford base32 with `0`, `O`, `1`, `I`, `L`
 * removed. Exported so tests (and anything validating pasted input) can check membership without
 * duplicating the literal.
 */
export const COUPON_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Default code length in characters. */
export const DEFAULT_COUPON_CODE_LENGTH = 10;

const AMBIGUOUS_CHARACTERS = ['0', 'O', '1', 'I', 'L'];

/**
 * Bits of entropy a single character of {@link COUPON_CODE_ALPHABET} contributes.
 *
 * @returns log2 of the alphabet size.
 */
export function bitsPerCharacter(): number {
  return Math.log2(COUPON_CODE_ALPHABET.length);
}

/**
 * Total entropy of a generated code of the given length.
 *
 * @param length - Code length in characters. Defaults to {@link DEFAULT_COUPON_CODE_LENGTH}.
 * @returns Bits of entropy in the resulting code space.
 */
export function bitsOfEntropy(length: number = DEFAULT_COUPON_CODE_LENGTH): number {
  return bitsPerCharacter() * length;
}

/**
 * Generate a random, human-shareable coupon code.
 *
 * Uses `crypto.randomInt`, which is uniformly distributed and cryptographically secure (unlike
 * `Math.random`), to pick each character independently from {@link COUPON_CODE_ALPHABET}.
 *
 * @param length - Number of characters to generate. Defaults to {@link DEFAULT_COUPON_CODE_LENGTH}.
 * @returns A code such as `"H7K4XPQ2MJ"`. Callers store it verbatim in `code` and normalize it
 *   (see `normalizeCouponCode` in `platform-coupons.ts`) into `code_normalized` for lookups.
 * @throws Error when `length` is not a positive integer.
 */
export function generateCouponCode(length: number = DEFAULT_COUPON_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('Coupon code length must be a positive integer');
  }

  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += COUPON_CODE_ALPHABET[randomInt(COUPON_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Assert the alphabet contains none of the characters known to be ambiguous when read aloud,
 * handwritten, or rendered in an unspecified font. Exported so the invariant is checkable outside
 * this module's own test suite, not just asserted inside it.
 *
 * @returns `true`. Throws instead of returning `false`, since a failure here means the module's
 *   own constant is wrong, not that a caller passed bad input.
 * @throws Error naming the offending character if the alphabet has been edited to include one.
 */
export function assertAlphabetHasNoAmbiguousCharacters(): true {
  for (const character of AMBIGUOUS_CHARACTERS) {
    if (COUPON_CODE_ALPHABET.includes(character)) {
      throw new Error(`Coupon code alphabet must not contain ambiguous character "${character}"`);
    }
  }
  return true;
}
