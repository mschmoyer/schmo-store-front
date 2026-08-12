/**
 * Every destination the marketing site is allowed to link to.
 *
 * A 404 reached from the homepage is a defect, so this file only names routes
 * that exist in `src/app` today. When a route lands, change it here once and
 * every header, footer and CTA follows.
 *
 * Deliberately absent:
 *   - `/changelog`, `/status`, `/about`, `/contact` — not built. The copy deck
 *     (§3.9, §3.13) requires the cards and sentences that depend on them to be
 *     cut rather than linked to a stub.
 *
 * HISTORY: `pricing`, `faq` and `comparison` used to be `/#…` anchors on the
 * homepage, even though `src/app/pricing/page.tsx` had been mounted for some
 * time. The nav therefore never left the homepage, which is why the homepage
 * had to carry a full pricing block, a full FAQ and a full comparison table —
 * roughly 3,000px of duplicated content. Pointing these three strings at the
 * real route is what made that content deletable.
 */
export const ROUTES = {
  home: '/',
  features: '/features',
  howItWorks: '/how-it-works',
  demoStores: '/demo-stores',
  /** The real pricing route. Carries the plan, the FAQ and the full comparison. */
  pricing: '/pricing',
  /** The FAQ lives on the pricing page, next to the thing it is asked about. */
  faq: '/pricing#faq',
  /** The full twelve-month Shopify Basic comparison table. */
  comparison: '/pricing#comparison',
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
