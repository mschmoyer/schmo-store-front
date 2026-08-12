/**
 * Store address (slug) generation and validation.
 *
 * The slug is the merchant's public URL — `rebelshops.com/store/{slug}` — so it
 * is generated from the store name as they type, shown live, and checked
 * against the server for availability. Everything in this module is pure so the
 * client, the API route and the tests all agree on what a legal slug is.
 */

/** Longest slug we will store. `stores.store_slug` is varchar(255) but a URL
 *  this long is a usability problem long before it is a storage one. */
export const SLUG_MAX_LENGTH = 48;

/** Shortest slug that is still a recognisable address. */
export const SLUG_MIN_LENGTH = 3;

/** Addresses the app itself owns — a store may never take one of these. */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'login',
  'logout',
  'signup',
  'signin',
  'create-store',
  'store',
  'stores',
  'checkout',
  'cart',
  'account',
  'settings',
  'pricing',
  'demo',
  'blog',
  'docs',
  'support',
  'help',
  'about',
  'legal',
  'privacy',
  'terms',
  'static',
  'public',
  'assets',
  'images',
  'www',
  'app',
  'dashboard',
];

/**
 * Turn free text into a legal store address.
 *
 * Diacritics are folded (`Café` → `cafe`), separators collapse to a single
 * hyphen, and anything outside `[a-z0-9-]` is dropped. Trailing hyphens are
 * kept *while typing* is handled by the caller — this function always returns a
 * fully-normalised slug, so "Northgate " becomes "northgate", not "northgate-".
 *
 * @param input - Raw text, typically the store name
 * @returns A normalised slug, possibly the empty string
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Same as {@link slugify} but tolerant of a hyphen the merchant is still typing,
 * so the live preview does not fight the cursor when they hit space.
 *
 * @param input - Raw text mid-keystroke
 * @returns A slug that may end in a single hyphen
 */
export function slugifyLive(input: string): string {
  const trailingSeparator = /[\s\-_]$/.test(input);
  const base = slugify(input);
  if (!base) return '';
  return trailingSeparator && base.length < SLUG_MAX_LENGTH ? `${base}-` : base;
}

export type SlugProblem =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'charset'
  | 'edge-hyphen'
  | 'reserved';

export interface SlugValidation {
  valid: boolean;
  problem?: SlugProblem;
  /** Merchant-facing copy, straight from the copy deck §5.2. */
  message?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a slug the merchant typed or edited by hand.
 *
 * @param slug - Candidate store address
 * @returns Whether it is legal, and the exact message to show if not
 */
export function validateSlug(slug: string): SlugValidation {
  if (!slug) {
    return { valid: false, problem: 'empty', message: 'Enter a store address' };
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      valid: false,
      problem: 'too-long',
      message: `Keep this under ${SLUG_MAX_LENGTH + 1} characters`,
    };
  }
  if (/^-|-$/.test(slug)) {
    return {
      valid: false,
      problem: 'edge-hyphen',
      message: 'Use lowercase letters, numbers and hyphens only',
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      problem: 'charset',
      message: 'Use lowercase letters, numbers and hyphens only',
    };
  }
  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      valid: false,
      problem: 'too-short',
      message: `Use at least ${SLUG_MIN_LENGTH} characters`,
    };
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return { valid: false, problem: 'reserved', message: 'That address is taken. Try another.' };
  }
  return { valid: true };
}

/**
 * Build the candidate list we offer when the merchant's first choice is taken.
 * Deterministic, so the same store name always suggests the same alternatives.
 *
 * @param slug - The slug that was rejected
 * @param count - How many alternatives to produce
 * @returns Legal, distinct suggestions in the order they should be offered
 */
export function suggestSlugs(slug: string, count = 3): string[] {
  const base = slugify(slug) || 'store';
  const trimmed = base.slice(0, SLUG_MAX_LENGTH - 6).replace(/-+$/, '');
  const candidates = [
    `${trimmed}-shop`,
    `${trimmed}-store`,
    `${trimmed}-co`,
    `${trimmed}-hq`,
    `${trimmed}-2`,
  ];
  const seen = new Set<string>([base]);
  const out: string[] = [];
  for (const candidate of candidates) {
    if (out.length >= count) break;
    if (seen.has(candidate)) continue;
    if (!validateSlug(candidate).valid) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

/**
 * The URL we promise the merchant, used by the live preview and the launch step
 * so the two can never disagree.
 *
 * @param slug - Store address
 * @param origin - Optional real origin; falls back to the production host
 * @returns A display URL such as `rebelshops.com/store/northgate-supply`
 */
export function storeUrlPreview(slug: string, origin?: string): string {
  const path = `/store/${slug || 'your-slug'}`;
  if (!origin) return `rebelshops.com${path}`;
  return `${origin.replace(/^https?:\/\//, '').replace(/\/$/, '')}${path}`;
}
