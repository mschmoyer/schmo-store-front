/**
 * Platform coupon code generation.
 *
 * The alphabet is Crockford-*ish* base32 with `0`, `O`, `1`, `I`, `L` removed — one more ambiguous
 * pair than real Crockford drops, because these codes get read aloud or copied by hand and that
 * matters more here than squeezing out the last bit of density. 31 symbols:
 * `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
 *
 * **Entropy per code:** log2(31) ≈ 4.95 bits/char — see {@link bitsPerCharacter} — not the round 5
 * bits/char a 32-symbol alphabet would give. At the default length of 10 that's ≈49.5 bits,
 * comfortably beyond what a rate-limited endpoint (`/join/[code]`, `/api/billing/coupon/preview`,
 * §9 of the plan) can exhaust online.
 *
 * Generation uses `node:crypto`'s CSPRNG (`randomInt`), never `Math.random`, because a coupon
 * worth up to a year of the product is a credential, not a UI nicety.
 */

import { randomInt } from 'node:crypto';

/**
 * The alphabet codes are drawn from — see the file header. Exported so tests (and anything
 * validating pasted input) can check membership without duplicating the literal.
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
 * Generate a random, human-shareable coupon code from {@link COUPON_CODE_ALPHABET}.
 *
 * @param length - Number of characters to generate. Defaults to {@link DEFAULT_COUPON_CODE_LENGTH}.
 * @returns A code such as `"H7K4XPQ2MJ"`. Callers normalize it via `normalizeCouponCode` (in
 *   `platform-coupons.ts`) into `code_normalized` for lookups.
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
 * Assert the alphabet contains none of the characters known to be ambiguous (see the file header).
 * Exported so the invariant is checkable outside this module's own tests.
 *
 * @returns `true`. Throws rather than returning `false`, since a failure here means the module's
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
