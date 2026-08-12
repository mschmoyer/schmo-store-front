import { PricingPage, pricingMetadata } from '@/components/marketing/pricing/PricingPage';

/**
 * `/pricing`.
 *
 * The page itself lives in `components/marketing/pricing/PricingPage`, which is
 * self-contained down to its own header and footer — this route is the two-line
 * mount that component's docblock asks for.
 *
 * HISTORY: this file used to be a 336-line stopgap with inline styles, hardcoded
 * `#F94E1B` fallbacks, no site header and no site footer, while the
 * design-system version sat orphaned and unimported. Nothing linked here to
 * expose it: `ROUTES.pricing` was the `/#pricing` anchor on the homepage. Both
 * halves of that are now fixed — the nav points at this route, and this route
 * renders the real page.
 *
 * Every price on it is derived from `components/marketing/data/pricing`, which
 * `__tests__/pricing.test.ts` pins against the Stripe billing constants in
 * `lib/billing/intro-offer`, so the quoted price and the actual charge cannot
 * drift apart.
 */
export const metadata = pricingMetadata;

export default function Page() {
  return <PricingPage />;
}
