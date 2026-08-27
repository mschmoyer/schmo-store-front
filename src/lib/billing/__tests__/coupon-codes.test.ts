import {
  COUPON_CODE_ALPHABET,
  DEFAULT_COUPON_CODE_LENGTH,
  assertAlphabetHasNoAmbiguousCharacters,
  bitsOfEntropy,
  bitsPerCharacter,
  generateCouponCode,
} from '../coupon-codes';

describe('COUPON_CODE_ALPHABET', () => {
  it('excludes every character that is ambiguous read aloud or handwritten', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(COUPON_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('is exactly 31 symbols (the 36-character [0-9A-Z] pool minus the ambiguous five)', () => {
    expect(COUPON_CODE_ALPHABET).toHaveLength(31);
  });

  it('has no duplicate characters', () => {
    expect(new Set(COUPON_CODE_ALPHABET.split(''))).toHaveProperty(
      'size',
      COUPON_CODE_ALPHABET.length
    );
  });

  it('is all uppercase', () => {
    expect(COUPON_CODE_ALPHABET).toBe(COUPON_CODE_ALPHABET.toUpperCase());
  });

  it('passes its own ambiguity assertion', () => {
    expect(assertAlphabetHasNoAmbiguousCharacters()).toBe(true);
  });
});

describe('entropy', () => {
  it('is log2(31) bits per character, ~4.95', () => {
    expect(bitsPerCharacter()).toBeCloseTo(Math.log2(31), 10);
    expect(bitsPerCharacter()).toBeGreaterThan(4.9);
    expect(bitsPerCharacter()).toBeLessThan(5);
  });

  it('is ~49.5 bits for the default 10-character code', () => {
    expect(DEFAULT_COUPON_CODE_LENGTH).toBe(10);
    expect(bitsOfEntropy()).toBeCloseTo(49.54, 1);
  });

  it('scales linearly with length', () => {
    expect(bitsOfEntropy(4)).toBeCloseTo(bitsPerCharacter() * 4, 10);
    expect(bitsOfEntropy(20)).toBeCloseTo(bitsPerCharacter() * 2 * 10, 10);
    expect(bitsOfEntropy(20)).toBeCloseTo(bitsOfEntropy(10) * 2, 10);
  });
});

describe('generateCouponCode', () => {
  it('generates a code of the default length', () => {
    expect(generateCouponCode()).toHaveLength(DEFAULT_COUPON_CODE_LENGTH);
  });

  it('generates a code of a requested length', () => {
    expect(generateCouponCode(6)).toHaveLength(6);
    expect(generateCouponCode(16)).toHaveLength(16);
  });

  it('only uses characters from the alphabet', () => {
    const code = generateCouponCode(64);
    for (const char of code) {
      expect(COUPON_CODE_ALPHABET).toContain(char);
    }
  });

  it('rejects a non-positive length', () => {
    expect(() => generateCouponCode(0)).toThrow(/positive integer/i);
    expect(() => generateCouponCode(-1)).toThrow(/positive integer/i);
  });

  it('rejects a non-integer length', () => {
    expect(() => generateCouponCode(4.5)).toThrow(/positive integer/i);
  });

  it('produces no collisions across a large sample', () => {
    const seen = new Set<string>();
    const sampleSize = 20_000;

    for (let i = 0; i < sampleSize; i += 1) {
      seen.add(generateCouponCode());
    }

    expect(seen.size).toBe(sampleSize);
  });

  it('is not derived from Math.random', () => {
    // generateCouponCode must keep working correctly even when Math.random is broken/stubbed,
    // proving it does not depend on it for randomness.
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random must not be used for coupon codes');
    };

    try {
      expect(() => generateCouponCode()).not.toThrow();
      const code = generateCouponCode(10);
      expect(code).toHaveLength(10);
    } finally {
      Math.random = original;
    }
  });
});
