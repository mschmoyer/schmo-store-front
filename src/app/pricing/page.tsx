import { cookies } from 'next/headers';
import { PricingPage, pricingMetadata } from '@/components/marketing/pricing/PricingPage';
import { CouponPricingPage } from './CouponPricingPage';
import { PLATFORM_COUPON_COOKIE } from '@/app/api/onboarding/_lib/coupon-cookie';
import { getPlatformCouponByCode, type PlatformCouponRecord } from '@/lib/platform/coupons';
import { isRedeemable } from '@/lib/billing/platform-coupons';

/**
 * `/pricing`. Renders the standard `PricingPage`, or `CouponPricingPage` when
 * a `/join/<CODE>` cookie names a still-redeemable coupon — see
 * docs/plans/platform-coupons.md §4A / §14 decision 4.
 *
 * Resolved server-side because the cookie is httpOnly by design, so a client
 * component can't read it; `cookies()` here also opts the route into
 * per-request rendering, which a per-visitor quote needs.
 *
 * Both variants derive their prices from the same billing constants
 * (`lib/billing/intro-offer`, `lib/billing/platform-coupons`), pinned by
 * `__tests__/pricing.test.ts`, so the quote can't drift from the charge.
 */
export const metadata = pricingMetadata;

/**
 * Read the `/join` cookie and resolve it to a currently-redeemable coupon.
 *
 * Re-validates with {@link isRedeemable} rather than trusting `/join` already
 * checked — the code could have been deactivated, expired, or exhausted since
 * the cookie was set (plan §11 invariant 4: the cookie is a hint, never an
 * entitlement). Every failure mode — missing cookie, unknown code, no-longer-
 * valid code, DB error — degrades silently to `null` (the standard page);
 * `/join` already told the visitor if their link didn't work.
 *
 * @returns The coupon to quote, or `null` when there is nothing to quote.
 */
async function resolvePricingCoupon(): Promise<PlatformCouponRecord | null> {
  let code: string | undefined;
  try {
    const store = await cookies();
    code = store.get(PLATFORM_COUPON_COOKIE)?.value;
  } catch {
    // Silent: this is how Next's build-time static-render attempt learns `/pricing` needs
    // per-request rendering — `cookies()` throws `DynamicServerError`, not an app fault.
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
    // Never log a code in full on a public path (plan §11 invariant 12).
    console.error('[pricing] coupon lookup failed:', error);
    return null;
  }
}

export default async function Page() {
  const coupon = await resolvePricingCoupon();
  return coupon ? <CouponPricingPage coupon={coupon} /> : <PricingPage />;
}
