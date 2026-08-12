import {
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  slugify,
  slugifyLive,
  storeUrlPreview,
  suggestSlugs,
  validateSlug,
} from '../slug';

describe('slugify', () => {
  it('lowercases and hyphenates a store name', () => {
    expect(slugify('Northgate Supply')).toBe('northgate-supply');
  });

  it('folds diacritics rather than dropping the letters', () => {
    expect(slugify('Café Örsted')).toBe('cafe-orsted');
  });

  it('drops apostrophes instead of turning them into hyphens', () => {
    expect(slugify("Mike's Hardware")).toBe('mikes-hardware');
    expect(slugify('Mike’s Hardware')).toBe('mikes-hardware');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('Bolts   &&&  Nuts!!!')).toBe('bolts-nuts');
  });

  it('never returns a leading or trailing hyphen', () => {
    expect(slugify('  --Northgate--  ')).toBe('northgate');
  });

  it('returns empty string for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('truncates to the maximum length without leaving a trailing hyphen', () => {
    const long = `${'a'.repeat(SLUG_MAX_LENGTH - 1)} bcdef`;
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(result.endsWith('-')).toBe(false);
  });

  it('is idempotent', () => {
    const once = slugify('Northgate Supply Co.');
    expect(slugify(once)).toBe(once);
  });
});

describe('slugifyLive', () => {
  it('keeps a trailing hyphen while the merchant is mid-word', () => {
    expect(slugifyLive('Northgate ')).toBe('northgate-');
  });

  it('does not keep a trailing hyphen when nothing follows the separator', () => {
    expect(slugifyLive(' ')).toBe('');
  });

  it('matches slugify once a word has been typed', () => {
    expect(slugifyLive('Northgate Supply')).toBe('northgate-supply');
  });
});

describe('validateSlug', () => {
  it('accepts a well-formed slug', () => {
    expect(validateSlug('northgate-supply')).toEqual({ valid: true });
  });

  it('rejects an empty slug', () => {
    expect(validateSlug('')).toMatchObject({ valid: false, problem: 'empty' });
  });

  it('rejects uppercase and spaces with the copy deck message', () => {
    expect(validateSlug('Northgate Supply')).toMatchObject({
      valid: false,
      problem: 'charset',
      message: 'Use lowercase letters, numbers and hyphens only',
    });
  });

  it('rejects leading and trailing hyphens', () => {
    expect(validateSlug('-northgate')).toMatchObject({ problem: 'edge-hyphen' });
    expect(validateSlug('northgate-')).toMatchObject({ problem: 'edge-hyphen' });
  });

  it('rejects doubled hyphens', () => {
    expect(validateSlug('north--gate')).toMatchObject({ valid: false, problem: 'charset' });
  });

  it('rejects anything shorter than the minimum', () => {
    expect(validateSlug('ab')).toMatchObject({ problem: 'too-short' });
  });

  it('rejects anything longer than the maximum', () => {
    expect(validateSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toMatchObject({ problem: 'too-long' });
  });

  it('rejects routes the app owns', () => {
    for (const reserved of ['admin', 'api', 'login', 'checkout']) {
      expect(RESERVED_SLUGS).toContain(reserved);
      expect(validateSlug(reserved)).toMatchObject({
        valid: false,
        problem: 'reserved',
        message: 'That address is taken. Try another.',
      });
    }
  });
});

describe('suggestSlugs', () => {
  it('offers legal alternatives that are not the original', () => {
    const suggestions = suggestSlugs('northgate-supply');
    expect(suggestions).toHaveLength(3);
    expect(suggestions).not.toContain('northgate-supply');
    for (const suggestion of suggestions) {
      expect(validateSlug(suggestion).valid).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(suggestSlugs('northgate')).toEqual(suggestSlugs('northgate'));
  });

  it('keeps suggestions within the length limit for a maximal slug', () => {
    for (const suggestion of suggestSlugs('a'.repeat(SLUG_MAX_LENGTH))) {
      expect(suggestion.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      expect(validateSlug(suggestion).valid).toBe(true);
    }
  });

  it('falls back to a usable base when the input is unusable', () => {
    expect(suggestSlugs('!!!')[0]).toBe('store-shop');
  });
});

describe('storeUrlPreview', () => {
  it('uses the /store/ path that actually exists in the app router', () => {
    expect(storeUrlPreview('northgate-supply')).toBe('rebelshops.com/store/northgate-supply');
  });

  it('shows a placeholder before anything has been typed', () => {
    expect(storeUrlPreview('')).toBe('rebelshops.com/store/your-slug');
  });

  it('prefers the real origin when one is supplied', () => {
    expect(storeUrlPreview('northgate', 'http://localhost:3000')).toBe(
      'localhost:3000/store/northgate'
    );
  });
});
