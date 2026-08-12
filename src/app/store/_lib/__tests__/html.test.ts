import { htmlToText, sanitizeRichText, toParagraphs } from '../html';

/**
 * The XSS boundary for merchant-authored copy.
 *
 * Product descriptions and rich-text sections both reach
 * `dangerouslySetInnerHTML`, so these cases are the guarantee that nothing
 * executable survives the trip.
 */
describe('sanitizeRichText', () => {
  it('keeps ordinary formatting', () => {
    const html = sanitizeRichText('<p>Hello <strong>world</strong></p><ul><li>One</li></ul>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<li>One</li>');
  });

  it('strips script tags and their contents', () => {
    const html = sanitizeRichText('<p>ok</p><script>alert(document.cookie)</script>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).toContain('ok');
  });

  it('strips inline event handlers', () => {
    const html = sanitizeRichText('<p onclick="steal()">text</p>');
    expect(html).not.toContain('onclick');
    expect(html).toContain('text');
  });

  it('strips javascript: URLs from links', () => {
    const html = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toContain('javascript:');
  });

  it('strips style and iframe entirely', () => {
    const html = sanitizeRichText(
      '<style>body{display:none}</style><iframe src="https://evil.example"></iframe><p>safe</p>',
    );
    expect(html).not.toContain('<style');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('safe');
  });

  it('hardens external links against reverse tabnabbing', () => {
    const html = sanitizeRichText('<a href="https://example.com">out</a>');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('lazy-loads images and rejects non-image schemes', () => {
    expect(sanitizeRichText('<img src="/a.png">')).toContain('loading="lazy"');
    expect(sanitizeRichText('<img src="javascript:alert(1)">')).not.toContain('javascript:');
  });

  it('returns an empty string for nothing to render', () => {
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText(undefined)).toBe('');
  });
});

describe('toParagraphs', () => {
  it('splits on blank lines and drops empties', () => {
    expect(toParagraphs('One\n\nTwo\n\n\n  \n\nThree')).toEqual(['One', 'Two', 'Three']);
  });

  it('returns an empty array for non-strings', () => {
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs(undefined)).toEqual([]);
  });
});

describe('htmlToText', () => {
  it('flattens markup to plain text', () => {
    expect(htmlToText('<p>Hello <em>there</em></p>')).toBe('Hello there');
  });

  it('truncates with an ellipsis', () => {
    const text = htmlToText(`<p>${'a'.repeat(300)}</p>`, 50);
    expect(text).toHaveLength(50);
    expect(text.endsWith('…')).toBe(true);
  });

  it('removes script contents rather than inlining them', () => {
    expect(htmlToText('<script>alert(1)</script><p>hi</p>')).toBe('hi');
  });
});
