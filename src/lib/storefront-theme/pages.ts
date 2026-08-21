/**
 * Custom storefront pages.
 *
 * A page is a title, a slug and an ordered `Section[]` — the *same* section
 * list the home page uses, rendered through the same registry. That is the
 * whole design: the section engine was already generic, so pages needed a place
 * to keep a list and a route to render it, and no new rendering primitives at
 * all. A section type added tomorrow works on every page for free.
 *
 * Why this matters more than it sounds: a store could previously compose
 * exactly one page. No About, no Shipping & Returns, no Size Guide, no Contact,
 * no landing page. Policy pages are not decoration — a shop that cannot state
 * its returns policy cannot legally trade in most of its markets, and Stripe
 * asks for the URL during Connect onboarding.
 */

import { z } from 'zod';

import { sectionsSchema } from './types';
import type { Section } from './types';

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

/**
 * Slugs a merchant may not take.
 *
 * Pages are served from `/store/<store>/pages/<slug>`, so these cannot actually
 * collide with `/cart` or `/checkout` today. They are reserved anyway, because
 * the moment a merchant maps a custom domain the storefront moves to the root
 * and `/cart` becomes genuinely ambiguous — and by then the merchant has
 * printed the URL on something. Reserving up front costs nothing; un-reserving
 * later is a broken link.
 */
export const RESERVED_PAGE_SLUGS: readonly string[] = [
  'account',
  'admin',
  'api',
  'blog',
  'cart',
  'checkout',
  'collections',
  'login',
  'logout',
  'order-success',
  'orders',
  'pages',
  'product',
  'products',
  'search',
  'signup',
  'store',
];

/** Slug rule: lowercase alphanumerics in hyphen-separated words. Mirrors the CHECK in migration 025. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalise arbitrary merchant text into a candidate page slug.
 *
 * Used by the editor to propose a slug from the title the merchant just typed,
 * so the common case needs no thought. It is a *proposal*: the result still goes
 * through {@link pageSlugSchema}, which is what actually decides.
 *
 * @param input - Free text, typically the page title
 * @returns A slug candidate, possibly empty when the input had nothing usable
 */
export function slugifyPageTitle(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks so "Café" becomes "cafe" rather than losing the e.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    // Slicing can leave a trailing hyphen behind; the pattern forbids one.
    .replace(/-+$/g, '');
}

/**
 * Whether a slug is available to a merchant.
 * @param slug - Candidate slug, already normalised
 * @returns True when the slug is well-formed and not reserved
 */
export function isUsablePageSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length <= 160 && !RESERVED_PAGE_SLUGS.includes(slug);
}

export const pageSlugSchema = z
  .string()
  .trim()
  .min(1, 'A page needs a URL slug')
  .max(160)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and hyphens, like shipping-returns')
  .refine(
    (slug) => !RESERVED_PAGE_SLUGS.includes(slug),
    (slug) => ({ message: `"${slug}" is reserved by the storefront` }),
  );

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

export interface PageSeo {
  metaTitle?: string;
  metaDescription?: string;
  /** Keeps a page out of search results. For thank-you and campaign landing pages. */
  noindex?: boolean;
}

export interface StorePage {
  slug: string;
  title: string;
  sections: Section[];
  seo: PageSeo;
}

/** A page as the editor's list view needs it — without the section payload. */
export interface StorePageSummary {
  slug: string;
  title: string;
  sectionCount: number;
  /** Whether a published row exists for this slug. */
  published: boolean;
  updatedAt: string;
}

export const pageSeoSchema = z
  .object({
    metaTitle: z.string().trim().max(200),
    metaDescription: z.string().trim().max(500),
    noindex: z.boolean(),
  })
  .partial()
  .strict();

/** Cap on pages one store may hold. Generous for a shop, low enough to bound a runaway writer. */
export const MAX_PAGES_PER_STORE = 50;

/** Body accepted when creating a page. */
export const createPageBodySchema = z
  .object({
    slug: pageSlugSchema,
    title: z.string().trim().min(1, 'A page needs a title').max(200),
    /** Optional starter composition, e.g. from a page template. */
    sections: sectionsSchema.optional(),
    seo: pageSeoSchema.optional(),
  })
  .strict();

/**
 * Body accepted when updating a page.
 *
 * `slug` is absent by design: changing a page's URL after it has been linked,
 * indexed or printed breaks those links silently. Renaming is a create plus a
 * delete, which at least makes the consequence visible to the merchant.
 */
export const updatePageBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    sections: sectionsSchema,
    seo: pageSeoSchema,
  })
  .partial()
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    'Provide at least one of "title", "sections" or "seo"',
  );

export type CreatePageBody = z.infer<typeof createPageBodySchema>;
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
