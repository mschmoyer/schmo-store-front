/**
 * Image-URL renderability tests.
 *
 * A value that reaches `next/image` and makes it throw returns HTTP 500 for the
 * whole storefront page — the throw escapes the section error boundary. This
 * predicate is the boundary that stops a hostile or malformed URL in one
 * product row from taking the shop down, so its accept/reject decisions are
 * worth pinning exactly.
 */

import { isRenderableImageUrl, renderableImageUrl } from '../renderable';

describe('isRenderableImageUrl', () => {
  it('accepts a root-relative path', () => {
    expect(isRenderableImageUrl('/uploads/hero.jpg')).toBe(true);
  });

  it('accepts any https URL, matching the image config', () => {
    expect(isRenderableImageUrl('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isRenderableImageUrl('https://images.marloweandfen.com/DSC_4471.jpg')).toBe(true);
  });

  it('accepts http only on localhost', () => {
    expect(isRenderableImageUrl('http://localhost:3000/a.jpg')).toBe(true);
    expect(isRenderableImageUrl('http://127.0.0.1/a.jpg')).toBe(true);
    expect(isRenderableImageUrl('http://evil.example/a.jpg')).toBe(false);
  });

  it('rejects the values that 500 the storefront', () => {
    // The reproduced crash: javascript: in featured_image_url.
    for (const hostile of [
      'javascript:alert(1)',
      'data:image/png;base64,iVBORw0KGgo=',
      'blob:http://localhost:3000/8f3e',
      '//evil.example/x.png',
      'not a url',
      '',
      '   ',
    ]) {
      expect(isRenderableImageUrl(hostile)).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    expect(isRenderableImageUrl(null)).toBe(false);
    expect(isRenderableImageUrl(undefined)).toBe(false);
    expect(isRenderableImageUrl(42)).toBe(false);
  });
});

describe('renderableImageUrl', () => {
  it('returns the trimmed value when renderable', () => {
    expect(renderableImageUrl('  https://cdn.example.com/a.jpg  ')).toBe('https://cdn.example.com/a.jpg');
  });

  it('returns null when not renderable', () => {
    expect(renderableImageUrl('javascript:alert(1)')).toBeNull();
    expect(renderableImageUrl(null)).toBeNull();
  });
});
