'use client';

/**
 * The storefront's tracking pixel, as a component.
 *
 * A zero-markup client component so the storefront's server components can opt into buyer-click
 * tracking with one line and without becoming client components themselves. Rendering it inside
 * `StoreLayout` is what keeps `StorefrontShell`, the theme engine and every page above it
 * server-rendered: only this leaf ships JavaScript.
 *
 * It renders `null`. It never suspends, never fetches on the render path, and holds no state, so
 * it cannot delay first paint or re-render anything around it. All of the behaviour — transport,
 * identity, de-duplication, privacy signals — lives in `useStorefrontClickTracking`.
 *
 * @see src/hooks/useStorefrontClickTracking.ts for the transport and privacy decisions
 * @see src/lib/analytics/storefront-clicks.ts for the server-side validation and bot policy
 */

import {
  useCartAddTracking,
  useStorefrontClickTracking,
} from '@/hooks/useStorefrontClickTracking';
import type { StorefrontClickEventType } from '@/lib/analytics/storefront-clicks';

export interface StorefrontClickTrackerProps {
  /** The store being viewed. Either this or `storeSlug` is required. */
  storeId?: string;
  /** The store's slug; resolved to an id server-side when no id is given. */
  storeSlug?: string;
  /** What to record. Defaults to `storefront_view`. */
  eventType?: StorefrontClickEventType;
  /** The product being viewed, for `product_view`. */
  productId?: string;
  /**
   * Set false to record nothing.
   *
   * The storefront layout passes `false` when the signed-in viewer owns this shop, so a merchant
   * checking their own storefront does not inflate their own traffic.
   */
  enabled?: boolean;
  /**
   * Also watch the cart and emit `add_to_cart` when it gains units.
   *
   * Only the layout-level tracker should enable this — one listener per page, not one per tracker,
   * or a product page would report every add twice.
   */
  trackCartAdds?: boolean;
}

/**
 * Record buyer-side storefront events for as long as this subtree is mounted.
 *
 * @param props - {@link StorefrontClickTrackerProps}
 * @returns Nothing rendered
 */
export function StorefrontClickTracker({
  storeId,
  storeSlug,
  eventType = 'storefront_view',
  productId,
  enabled = true,
  trackCartAdds = false,
}: StorefrontClickTrackerProps): null {
  useStorefrontClickTracking({ storeId, storeSlug, eventType, productId, enabled });
  useCartAddTracking({ storeId, enabled: enabled && trackCartAdds });
  return null;
}
