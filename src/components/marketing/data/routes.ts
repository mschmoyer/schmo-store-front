/**
 * Every destination the marketing site is allowed to link to.
 *
 * A 404 reached from the homepage is a defect, so this file only names routes
 * that exist in `src/app` today. When a route lands, change it here once and
 * every header, footer and CTA follows.
 *
 * Deliberately absent:
 *   - `/pricing` — the route is owned by another agent and is not mounted yet,
 *     so pricing links point at the homepage pricing block until it is.
 *   - `/changelog`, `/status`, `/about`, `/contact` — not built. The copy deck
 *     (§3.9, §3.13) requires the cards and sentences that depend on them to be
 *     cut rather than linked to a stub.
 */
export const ROUTES = {
  home: '/',
  features: '/features',
  howItWorks: '/how-it-works',
  demoStores: '/demo-stores',
  /** Homepage pricing block. Swap to `/pricing` the day that route mounts. */
  pricing: '/#pricing',
  /** Homepage FAQ block. */
  faq: '/#faq',
  /** Homepage cost comparison. */
  comparison: '/#comparison',
  /** Account creation + store setup wizard. No card is taken today. */
  signUp: '/create-store',
  signIn: '/login',
  storeIndex: '/store',
} as const;

/** The three seeded demo storefronts, in the order the site presents them. */
export const DEMO_STORE_SLUGS = ['demo-electronics', 'artisan-craft', 'fitness-pro'] as const;

export type DemoStoreSlug = (typeof DEMO_STORE_SLUGS)[number];

/**
 * Builds the public URL for a storefront.
 *
 * @param slug - The store's slug.
 * @returns The storefront path.
 */
export function storeUrl(slug: string): string {
  return `/store/${slug}`;
}
