import { cookies } from 'next/headers';
import { PricingPage, pricingMetadata } from '@/components/marketing/pricing/PricingPage';
import { CouponPricingPage } from './CouponPricingPage';
import { PLATFORM_COUPON_COOKIE } from '@/app/api/onboarding/_lib/coupon-cookie';
import { getPlatformCouponByCode, type PlatformCouponRecord } from '@/lib/platform/coupons';
import { isRedeemable } from '@/lib/billing/platform-coupons';

/**
 * `/pricing`.
 *
 * The page itself lives in `components/marketing/pricing/PricingPage`, which is
 * self-contained down to its own header and footer — this route is the two-line
 * mount that component's docblock asks for, **for a visitor with no coupon in
 * play**. A visitor who arrived via `/join/<CODE>` carries an httpOnly cookie
 * (`src/app/api/onboarding/_lib/coupon-cookie.ts`) naming the code, and this
 * file's job is to notice that cookie server-side and quote the coupon's real
 * offer instead — see `docs/plans/platform-coupons.md` §4A / §14 decision 4:
 * "A merchant who is promised a free year by a link and then shown '$1 for 3
 * months, then $19.99' on `/pricing` has already been told two different
 * things before they reach a form."
 *
 * This has to happen here, server-side: the cookie is `httpOnly` by design (so
 * a stray script cannot read which offer a visitor is on), which means it is
 * invisible to a client component and there is nothing to `fetch` — reading it
 * any other way would mean either giving up `httpOnly` or adding a second,
 * non-httpOnly cookie just to leak the same fact. `cookies()` from
 * `next/headers` is the one place this repo already reads a cookie inside an
 * App Router page (see `src/app/store/[storeSlug]/page.tsx`), and using it here
 * opts this route into per-request dynamic rendering, which is exactly what a
 * per-visitor price quote needs.
 *
 * `resolvePricingCoupon` re-validates the cookie's code with
 * {@link isRedeemable} rather than trusting that `/join` already checked it —
 * plan §11 invariant 4, "the cookie is a hint, never an entitlement": the code
 * could have been deactivated, expired, or exhausted in the 29 days since the
 * cookie was set. An unknown, inactive, expired or exhausted code — or any
 * failure reading the cookie or the database — degrades silently to the
 * standard `<PricingPage />`. This is deliberate, not a missed error case:
 * `/join` and the onboarding wizard already told the visitor if their link
 * didn't work (plan §4A), so `/pricing` is not the place to say it again, and
 * showing the *wrong* offer would be worse than showing the standard one.
 *
 * HISTORY: this file used to be a 336-line stopgap with inline styles, hardcoded
 * `#F94E1B` fallbacks, no site header and no site footer, while the
 * design-system version sat orphaned and unimported. Nothing linked here to
 * expose it: `ROUTES.pricing` was the `/#pricing` anchor on the homepage. Both
 * halves of that are now fixed — the nav points at this route, and this route
 * renders the real page.
 *
 * Every price on the standard page is derived from
 * `components/marketing/data/pricing`, which `__tests__/pricing.test.ts` pins
 * against the Stripe billing constants in `lib/billing/intro-offer`, so the
 * quoted price and the actual charge cannot drift apart. The coupon variant
 * derives its numbers the same way, from `lib/billing/platform-coupons` and
 * the same `PLATFORM_LIST_AMOUNT_CENTS` constant — see `CouponPlanCard.tsx`.
 */
export const metadata = pricingMetadata;

/**
 * Read the `/join` cookie and resolve it to a currently-redeemable coupon.
 *
 * Never throws: a missing cookie, an unknown code, a code that has since gone
 * inactive/expired/exhausted, or a database error all resolve to `null`, which
 * the caller renders as the standard page. Nothing here writes anything —
 * this only describes an offer, the same non-mutating shape as
 * `previewCouponForVisitor` in `src/app/api/onboarding/_lib/state.ts` (not
 * reused directly because that function takes a `Request`, which an App
 * Router page does not receive; the underlying reads are identical).
 *
 * @returns The coupon to quote, or `null` when there is nothing to quote.
 */
async function resolvePricingCoupon(): Promise<PlatformCouponRecord | null> {
  let code: string | undefined;
  try {
    const store = await cookies();
    code = store.get(PLATFORM_COUPON_COOKIE)?.value;
  } catch {
    // Silent, matching `isStoreOwner` in `store/[storeSlug]/page.tsx`: this is also how Next's own
    // build-time static-render attempt learns `/pricing` needs per-request rendering — `cookies()`
    // throws a `DynamicServerError` the framework expects to see, not an application fault, and
    // logging it as one would put a scary false "error" in every production build's output.
    return null;
  }

  if (!code) {
    return null;
  }

  try {
    const coupon = await getPlatformCouponByCode(code);
    if (!coupon) {
      return null;
    }
    return isRedeemable(coupon).status === 'ok' ? coupon : null;
  } catch (error) {
    // A code is never logged in full on a public-facing path (plan §11 invariant 12), and neither
    // is a lookup failure here worth surfacing as anything but "quote the standard price".
    console.error('[pricing] coupon lookup failed:', error);
    return null;
  }
}

export default async function Page() {
  const coupon = await resolvePricingCoupon();
  return coupon ? <CouponPricingPage coupon={coupon} /> : <PricingPage />;
}
