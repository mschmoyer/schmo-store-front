import sanitizeHtml from 'sanitize-html';

/**
 * HTML sanitising for merchant-authored copy.
 *
 * Two kinds of merchant HTML reach a shopper's browser: product descriptions
 * (`products.description_html`) and rich-text section bodies. Both are stored
 * by an authenticated merchant, which makes them *lower* risk than anonymous
 * input but not trusted: a compromised merchant account, a poisoned
 * ShipStation sync, or a merchant pasting from a hostile source all end with
 * script in a column. Anything that reaches `dangerouslySetInnerHTML` goes
 * through here first — that is the boundary, and there is no second one.
 */

/**
 * The allow-list. Deliberately narrow: formatting, lists, links, tables and
 * images. No `<script>`, no `<style>`, no `<iframe>`, no event handlers, and
 * no `id` (which could collide with the page's own anchors).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
    'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  // `data:` is excluded for links and permitted for images only, below.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  // Anything not on the list is dropped along with its contents when it could
  // carry executable payload; otherwise only the tag is unwrapped.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  transformTags: {
    // An external link opened in a new tab without `noopener` hands the opener
    // window to the destination. Always attach it.
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const external = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy' },
    }),
  },
};

/** Hard cap, so a runaway description cannot blow up a render. */
const MAX_LENGTH = 100_000;

/**
 * Sanitise merchant HTML for rendering.
 * @param html - Raw HTML from the database or a section setting
 * @returns Safe HTML, or an empty string when there is nothing to render
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (typeof html !== 'string' || html.trim() === '') return '';
  return sanitizeHtml(html.slice(0, MAX_LENGTH), OPTIONS).trim();
}

/**
 * Render plain text as paragraphs, escaping everything.
 *
 * Used for the `long_description` column and for section bodies a merchant
 * typed into a textarea: they contain newlines rather than markup, and treating
 * them as HTML would both mangle the copy and widen the attack surface for no
 * benefit.
 *
 * @param text - Plain text, possibly with blank-line paragraph breaks
 * @returns An array of paragraph strings
 */
export function toParagraphs(text: string | null | undefined): string[] {
  if (typeof text !== 'string') return [];
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 60);
}

/**
 * Reduce HTML to a plain-text summary, for meta descriptions and card excerpts.
 * @param html - Raw HTML
 * @param limit - Maximum characters
 * @returns Trimmed plain text
 */
export function htmlToText(html: string | null | undefined, limit = 200): string {
  if (typeof html !== 'string' || html === '') return '';
  const text = sanitizeHtml(html.slice(0, MAX_LENGTH), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
