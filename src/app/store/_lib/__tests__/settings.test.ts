import { bool, idList, imageSrc, list, num, pick, str } from '../settings';

/**
 * Section settings come out of JSONB and may have been written by an older
 * build or by a merchant editing JSON by hand. Every reader has to survive the
 * wrong type without throwing — spec section 8: one bad section must never
 * blank a storefront.
 */
describe('section setting readers', () => {
  it('str coerces and falls back', () => {
    expect(str({ a: '  hi  ' }, 'a')).toBe('hi');
    expect(str({ a: 42 }, 'a')).toBe('42');
    expect(str({}, 'a', 'fallback')).toBe('fallback');
    expect(str({ a: null }, 'a', 'fallback')).toBe('fallback');
    expect(str({ a: { nested: true } }, 'a', 'fallback')).toBe('fallback');
  });

  it('bool only honours a real boolean', () => {
    expect(bool({ a: false }, 'a', true)).toBe(false);
    expect(bool({ a: 'false' }, 'a', true)).toBe(true);
    expect(bool({}, 'a', true)).toBe(true);
  });

  it('num clamps into range and survives junk', () => {
    expect(num({ a: 5 }, 'a', 3, 1, 10)).toBe(5);
    expect(num({ a: 500 }, 'a', 3, 1, 10)).toBe(10);
    expect(num({ a: -5 }, 'a', 3, 1, 10)).toBe(1);
    expect(num({ a: 'nonsense' }, 'a', 3, 1, 10)).toBe(3);
    expect(num({}, 'a', 3, 1, 10)).toBe(3);
  });

  it('pick constrains to the known options', () => {
    const allowed = ['left', 'center'] as const;
    expect(pick({ a: 'center' }, 'a', allowed, 'left')).toBe('center');
    expect(pick({ a: 'diagonal' }, 'a', allowed, 'left')).toBe('left');
    expect(pick({}, 'a', allowed, 'left')).toBe('left');
  });

  it('list drops non-object entries and caps length', () => {
    expect(list({ a: [{ x: 1 }, 'nope', null, [1], { y: 2 }] }, 'a')).toEqual([
      { x: 1 },
      { y: 2 },
    ]);
    expect(list({ a: 'not an array' }, 'a')).toEqual([]);
    expect(list({ a: Array.from({ length: 50 }, () => ({})) }, 'a', 5)).toHaveLength(5);
  });

  it('idList accepts only UUID-shaped strings', () => {
    const good = '11111111-1111-4111-8111-111111111111';
    expect(idList({ a: [good, 'nope', 42, null] }, 'a')).toEqual([good]);
    expect(idList({ a: 'not an array' }, 'a')).toEqual([]);
  });
});

describe('imageSrc', () => {
  it('accepts same-origin paths', () => {
    expect(imageSrc({ image: '/demo/products/a.svg' }, 'image')).toBe('/demo/products/a.svg');
  });

  it('accepts data image URIs', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(imageSrc({ image: uri }, 'image')).toBe(uri);
  });

  it('rejects remote and protocol-relative URLs', () => {
    // A remote src in a merchant setting is both mixed content and a beacon.
    expect(imageSrc({ image: 'https://tracker.example/pixel.gif' }, 'image')).toBe('');
    expect(imageSrc({ image: '//tracker.example/pixel.gif' }, 'image')).toBe('');
  });

  it('rejects non-image data URIs', () => {
    expect(imageSrc({ image: 'data:text/html;base64,PHNjcmlwdD4=' }, 'image')).toBe('');
  });

  it('returns empty for missing or wrongly typed values', () => {
    expect(imageSrc({}, 'image')).toBe('');
    expect(imageSrc({ image: 42 }, 'image')).toBe('');
  });
});
