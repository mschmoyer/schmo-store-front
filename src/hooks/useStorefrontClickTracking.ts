'use client';

/**
 * Client-side buyer-click tracking for merchant storefronts.
 *
 * The browser half of `POST /api/storefront/click`. Its job is to be *invisible*: a storefront
 * must render, paint and remain interactive exactly as it would if this file did not exist.
 * Everything below follows from that.
 *
 * ## Why not just reuse `useVisitorTracking`
 *
 * `useVisitorTracking` posts to `/api/visitors`, which is `UNIQUE (store_id, ip_address,
 * visited_date)` — one row per IP per day, by design. It answers "how many people", and it cannot
 * answer "how many clicks" or "which pages" without changing what it is. This hook is additive:
 * it feeds `storefront_click_events`, which keeps every event. Both run; neither duplicates the
 * other. Do not delete one thinking it is a copy of the other.
 *
 * ## Transport
 *
 * `navigator.sendBeacon` first. A `storefront_view` fires on mount and a shopper may click through
 * to the next page in the same tick; a normal `fetch` is cancelled when the document unloads and
 * the event is silently lost, which is precisely the traffic a funnel most needs to see. Beacons
 * are queued by the browser and survive the navigation. Where `sendBeacon` is missing or refuses
 * (its queue is bounded), `fetch(..., { keepalive: true })` is the fallback with the same property.
 * Both are fire-and-forget: no `await`, no state, no re-render, and a rejected promise is swallowed
 * because a tracking failure must never surface in a shopper's console as an unhandled rejection.
 *
 * ## Identity
 *
 * `visitorId` in `localStorage` and `sessionId` in `sessionStorage`, under the same `visitor_id` /
 * `session_id` keys `src/lib/analytics.ts` already uses, so a visitor has one identity across both
 * trackers rather than two that disagree. New ids are `crypto.randomUUID()`; the pre-UUID format
 * that file writes is read back unchanged when it is already there. Storage that throws (Safari
 * private mode, disabled cookies) degrades to an anonymous, un-stitched event rather than an error.
 *
 * ## Not tracking
 *
 * `navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl === true` suppresses the
 * beacon entirely, and the headers are checked again server-side. See the decision recorded in
 * `src/lib/analytics/storefront-clicks.ts` — an undercount of people who asked not to be counted
 * is the failure mode we chose.
 */

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import type { StorefrontClickEventType } from '@/lib/analytics/storefront-clicks';

/** `localStorage` key shared with `src/lib/analytics.ts`, so one visitor is one id. */
const VISITOR_KEY = 'visitor_id';
/** `sessionStorage` key shared with `src/lib/analytics.ts`. */
const SESSION_KEY = 'session_id';
/** The cart's `localStorage` key, fixed by `components/store/cart/CartProvider.tsx`. */
const CART_KEY = 'cart';
/** The window event `CartProvider` dispatches after every cart write. */
const CART_EVENT = 'cartUpdated';

/**
 * How long an identical view event is suppressed after being sent.
 *
 * React StrictMode runs every effect twice in development — mount, cleanup, mount — which would
 * double every `storefront_view` in the dev database and make the local dashboard quietly wrong.
 * A ref guard alone handles that (the two runs share a component instance), but a Suspense
 * re-mount or a Fast Refresh does not, so the guard is also module-level and time-boxed. Two
 * seconds is long enough to absorb a double-render and far too short to swallow a shopper
 * genuinely returning to a page.
 */
const VIEW_DEDUPE_MS = 2000;

/** Recently sent view keys → timestamp. Module scope so it survives a component remount. */
const recentViews = new Map<string, number>();

/** The payload `POST /api/storefront/click` accepts. */
export interface StorefrontClickPayload {
  storeId?: string;
  storeSlug?: string;
  eventType: StorefrontClickEventType;
  path?: string;
  productId?: string;
  visitorId?: string | null;
  sessionId?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/** Options accepted by {@link useStorefrontClickTracking}. */
export interface StorefrontClickTrackingOptions {
  /** The store being viewed. Either this or `storeSlug` is required. */
  storeId?: string;
  /** The store's slug, resolved to an id server-side. */
  storeSlug?: string;
  /** What happened. Defaults to `storefront_view`. */
  eventType?: StorefrontClickEventType;
  /** The product, for `product_view` and `add_to_cart`. */
  productId?: string;
  /** Set false to suppress tracking — used for the merchant viewing their own shop. */
  enabled?: boolean;
}

/** `globalPrivacyControl` is not in the DOM lib's `Navigator` yet. */
interface PrivacyNavigator extends Navigator {
  globalPrivacyControl?: boolean;
}

/**
 * Whether this browser has asked not to be tracked.
 *
 * @returns True when DNT or Global Privacy Control is set, or when there is no `navigator` at all
 */
export function isTrackingSuppressed(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as PrivacyNavigator;
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/**
 * A random identifier, preferring `crypto.randomUUID`.
 *
 * `randomUUID` is unavailable in insecure contexts (a plain-http staging host), so the fallback
 * mirrors the format `src/lib/analytics.ts` already writes rather than inventing a third one.
 *
 * @returns An identifier no longer than the column's 64 characters
 */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the legacy format.
  }
  return `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Read an id from a storage, creating and persisting one if it is absent.
 *
 * @param storage - `localStorage` or `sessionStorage`; may be unavailable
 * @param key - The storage key
 * @returns The id, or null when storage cannot be used at all
 */
function readOrCreateId(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(key);
    if (existing) return existing.slice(0, 64);
    const created = newId();
    storage.setItem(key, created);
    return created;
  } catch {
    // Private mode, quota, or storage disabled. An anonymous event is still a real click.
    return null;
  }
}

/**
 * This browser's persistent visitor id, creating one on first use.
 * @returns The visitor id, or null when `localStorage` is unavailable
 */
export function storefrontVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  return readOrCreateId(window.localStorage, VISITOR_KEY);
}

/**
 * This tab's session id, creating one on first use.
 * @returns The session id, or null when `sessionStorage` is unavailable
 */
export function storefrontSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return readOrCreateId(window.sessionStorage, SESSION_KEY);
}

/**
 * Post one event, without blocking anything and without ever throwing.
 *
 * @param payload - The event to send
 * @returns Nothing; delivery is best-effort by design
 */
export function sendStorefrontClick(payload: StorefrontClickPayload): void {
  if (typeof window === 'undefined') return;
  if (isTrackingSuppressed()) return;
  if (!payload.storeId && !payload.storeSlug) return;

  const body = JSON.stringify(payload);
  const url = '/api/storefront/click';

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // The Blob's type matters: without it the browser sends `text/plain` and the route's
      // `request.json()` still parses, but a stricter proxy in front of it may not.
      const queued = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (queued) return;
    }
  } catch {
    // Fall through to fetch.
  }

  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Swallowed deliberately: a tracking failure is not a shopper's problem.
    });
  } catch {
    // Nothing left to try, and nothing worth telling the shopper about.
  }
}

/**
 * Campaign attribution read from the current URL.
 *
 * Read from `window.location` rather than `useSearchParams`, because that hook opts the whole
 * subtree into client-side rendering unless it is wrapped in Suspense — a real cost to a
 * storefront's first paint, paid for a tracking pixel.
 *
 * @returns The three UTM fields, each null when absent
 */
function readUtm(): Pick<StorefrontClickPayload, 'utmSource' | 'utmMedium' | 'utmCampaign'> {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

/**
 * The referrer, with same-origin navigations dropped.
 *
 * A shopper moving from the home page to a product page would otherwise be reported as traffic
 * referred by the merchant's own shop, which would make "top referrers" a list of the store itself.
 *
 * @returns An external referrer URL, or null
 */
function readReferrer(): string | null {
  try {
    const referrer = document.referrer;
    if (!referrer) return null;
    if (new URL(referrer).origin === window.location.origin) return null;
    return referrer;
  } catch {
    return null;
  }
}

/**
 * Track one storefront event whenever the path (or the tracked product) changes.
 *
 * Mounted in the storefront layout for `storefront_view`, and again on the product page for
 * `product_view`. The layout instance does *not* remount on a client-side navigation, so the
 * pathname is part of the effect's key rather than left to mount timing — without that, a shopper
 * browsing six pages would register one view.
 *
 * @param options - {@link StorefrontClickTrackingOptions}
 * @returns Nothing; the hook renders nothing and holds no state
 */
export function useStorefrontClickTracking({
  storeId,
  storeSlug,
  eventType = 'storefront_view',
  productId,
  enabled = true,
}: StorefrontClickTrackingOptions): void {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!storeId && !storeSlug) return;

    const key = `${storeId ?? storeSlug}|${eventType}|${pathname}|${productId ?? ''}`;

    // Instance-level guard: StrictMode's mount → cleanup → mount runs on one instance.
    if (lastSent.current === key) return;

    // Module-level guard: a Suspense remount or Fast Refresh gives a fresh instance.
    const now = Date.now();
    for (const [seen, at] of recentViews) {
      if (now - at > VIEW_DEDUPE_MS) recentViews.delete(seen);
    }
    if (recentViews.has(key)) return;

    lastSent.current = key;
    recentViews.set(key, now);

    sendStorefrontClick({
      storeId,
      storeSlug,
      eventType,
      path: pathname ?? undefined,
      productId,
      visitorId: storefrontVisitorId(),
      sessionId: storefrontSessionId(),
      referrer: readReferrer(),
      ...readUtm(),
    });
  }, [storeId, storeSlug, eventType, productId, pathname, enabled]);
}

/** A cart line as `CartProvider` persists it. Only the three fields read here are relied on. */
interface StoredCartLine {
  product_id?: unknown;
  quantity?: unknown;
  store_id?: unknown;
}

/**
 * Read the current per-product quantities for one store from the shared cart storage.
 *
 * @param storeId - Only lines belonging to this store are counted
 * @returns Product id → quantity
 */
function readCartQuantities(storeId: string): Map<string, number> {
  const quantities = new Map<string, number>();
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return quantities;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return quantities;
    for (const entry of parsed as StoredCartLine[]) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.store_id !== storeId) continue;
      const id = typeof entry.product_id === 'string' ? entry.product_id : null;
      const quantity = Number(entry.quantity);
      if (!id || !Number.isFinite(quantity) || quantity <= 0) continue;
      quantities.set(id, quantity);
    }
  } catch {
    // A malformed or unavailable cart simply means no add can be observed.
  }
  return quantities;
}

/**
 * Emit `add_to_cart` when the shopper's cart gains units.
 *
 * `CartProvider` owns the cart and belongs to another track, so this observes rather than
 * instruments: it listens for the `cartUpdated` window event that provider already dispatches on
 * every write, diffs the stored quantities against the previous snapshot, and reports each product
 * whose quantity went up.
 *
 * Two honest limitations, stated rather than hidden:
 *
 *  * Raising a line's quantity with the stepper on the cart page counts as an add. It is a
 *    shopper adding units, so the number is defensible, but it is not only the "Add to cart"
 *    button.
 *  * A cart change made while no storefront page is mounted is invisible. There is no such path
 *    today — the provider wraps every storefront page — but a future headless cart write would be.
 *
 * The snapshot is taken at mount, so an existing cart is never replayed as a fresh add.
 *
 * @param options.storeId - The store whose cart lines to watch
 * @param options.enabled - Set false to suppress tracking
 * @returns Nothing
 */
export function useCartAddTracking({
  storeId,
  enabled = true,
}: {
  storeId?: string;
  enabled?: boolean;
}): void {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!enabled || !storeId) return;
    if (typeof window === 'undefined') return;

    let previous = readCartQuantities(storeId);

    const onCartUpdated = () => {
      const current = readCartQuantities(storeId);
      for (const [productId, quantity] of current) {
        if (quantity > (previous.get(productId) ?? 0)) {
          sendStorefrontClick({
            storeId,
            eventType: 'add_to_cart',
            path: pathRef.current ?? undefined,
            productId,
            visitorId: storefrontVisitorId(),
            sessionId: storefrontSessionId(),
            referrer: readReferrer(),
            ...readUtm(),
          });
        }
      }
      previous = current;
    };

    window.addEventListener(CART_EVENT, onCartUpdated);
    return () => window.removeEventListener(CART_EVENT, onCartUpdated);
  }, [storeId, enabled]);
}
