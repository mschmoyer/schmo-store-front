/**
 * A single decision about whether an image URL is safe to hand to `next/image`.
 *
 * `next/image` throws during server render when given a `src` it cannot fetch —
 * a `javascript:` or `data:` value, a `blob:` pointer, a `//host` reference, or
 * an `https` host the deployment has not allow-listed. A thrown error inside a
 * server-rendered storefront section escapes the section error boundary (which
 * only wraps the async component call and client hydration), so **one bad image
 * URL in one product row returns HTTP 500 for the entire page.** That was
 * reproducible: a `javascript:alert(1)` written into `products.featured_image_url`
 * turned `/store/<slug>` and `/store/<slug>/products` into 500s.
 *
 * Merchant image fields are free text — a URL box today, and whatever a future
 * media library, CSV import or AI composer writes — so this is a data-boundary
 * concern, not a per-component one. Sanitising at the point every storefront
 * query builds its view models protects every `<Image>` downstream at once,
 * regardless of how many call sites exist or are added later.
 *
 * What is allowed, deliberately matching `next.config.ts`'s image policy:
 *   - a root-relative path (`/uploads/hero.jpg`) — but not protocol-relative `//`
 *   - an `https:` URL (the config allows any https host for product imagery)
 *   - an `http:` URL only on localhost, so local development renders
 * Everything else — `javascript:`, `data:`, `blob:`, `ftp:`, a bare word — is
 * rejected. `data:` images are safe content but `next/image` refuses them, so
 * they are rejected here too rather than 500 the page.
 */

/**
 * Whether a value is safe to pass to `next/image` as `src`.
 * @param src - Candidate image reference.
 * @returns True when `next/image` can render it without throwing.
 */
export function isRenderableImageUrl(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const value = src.trim();
  if (value === '') return false;
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/**
 * Normalise a merchant-supplied image reference for rendering.
 * @param src - Candidate image reference.
 * @returns The trimmed value when renderable, otherwise null.
 */
export function renderableImageUrl(src: unknown): string | null {
  return isRenderableImageUrl(src) ? src.trim() : null;
}
