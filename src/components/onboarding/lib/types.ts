/**
 * Wire types shared by the onboarding API routes and the wizard client.
 *
 * The wizard holds no authoritative state of its own: everything below is what
 * the server says, fetched on mount and re-fetched after every mutation. That
 * is what makes "close the tab at step 4 and come back" work.
 */

import type { StepId } from './steps';

export type ImportStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'
  | 'skipped';

export interface ImportProgress {
  status: ImportStatus;
  /** Products ShipStation has told us about so far. Real count, not a guess. */
  found: number;
  /**
   * Size of the whole catalog, straight out of ShipStation's list envelope
   * (`total`, or `pages × page_size` when only a page count is returned).
   *
   * `null` means ShipStation did not tell us, and the UI must then show an
   * indeterminate bar. It must never fall back to `found`, which only counts
   * pages already read and would therefore report 100% from page one.
   */
  total: number | null;
  /** Products written into `products`. Real count. */
  imported: number;
  /** Products we read but could not write. */
  failed: number;
  /** SKUs with a stock level attached. */
  skus: number;
  /** Warehouses seen on the account. */
  warehouses: number;
  /** Pagination cursor, so a resumed import does not start from page 1. */
  page: number;
  /** Whether ShipStation has more pages for us. */
  hasMore: boolean;
  error?: string | null;
  errorAction?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface OnboardingUser {
  email: string;
  firstName: string;
  lastName: string;
}

export interface OnboardingStore {
  id: string;
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
}

export interface OnboardingShipStation {
  connected: boolean;
  skipped: boolean;
  /** Never the key itself — `••••••••2f9c`. See audit P0-1/P0-9. */
  maskedKey: string | null;
  warehouseCount: number | null;
  /** Whether the account is on a plan that limits what we can read. */
  planLimited: boolean;
  checkedAt: string | null;
}

export interface OnboardingTheme {
  presetId: string | null;
  /** Where the choice was actually persisted, so the UI can be honest. */
  persistedTo: 'storefront_themes' | 'legacy_theme_name' | null;
}

/**
 * Why a platform signup coupon (docs/plans/platform-coupons.md §4A) could not be honoured.
 * `'already_claimed'` is account-creation only (a new user already holding a live claim); the
 * rest mirror `CouponRedeemability['status']` in `src/lib/billing/platform-coupons.ts`. Signup
 * itself always succeeds regardless — this only ever describes the discount.
 */
export type OnboardingCouponErrorReason =
  | 'unknown'
  | 'expired'
  | 'exhausted'
  | 'inactive'
  | 'already_claimed';

/**
 * What the wizard shows about a `/join/<code>` link, at every step of the run — see
 * `docs/plans/platform-coupons.md` §4A/§6. Populated two ways: before an account exists, a preview
 * of the cookie `/join` set (or the failure reason `/join` put on the query string); after account
 * creation, the real outcome of `attributeCoupon`, persisted so it survives every later step.
 */
export interface OnboardingCoupon {
  /** The code as issued, for display. `null` when there is nothing to show. */
  code: string | null;
  /** The offer sentence from `describePlatformCoupon`. `null` until a valid coupon is known. */
  offer: string | null;
  /** Whether Checkout will still require a card. `null` until a valid coupon is known. */
  requiresPaymentMethod: boolean | null;
  /** Set only when a code could not be honoured. Signup still works at standard pricing. */
  errorReason: OnboardingCouponErrorReason | null;
  /** Whether the coupon has actually been reserved against this account, not merely previewed. */
  attributed: boolean;
}

/** The "nothing to show" default — no link was ever involved. */
export const NO_ONBOARDING_COUPON: OnboardingCoupon = {
  code: null,
  offer: null,
  requiresPaymentMethod: null,
  errorReason: null,
  attributed: false,
};

export interface OnboardingState {
  authenticated: boolean;
  currentStep: StepId;
  completedSteps: StepId[];
  status: 'in_progress' | 'completed';
  user: OnboardingUser | null;
  store: OnboardingStore | null;
  shipstation: OnboardingShipStation;
  importProgress: ImportProgress;
  theme: OnboardingTheme;
  /** Absolute, working URL of the merchant's storefront. */
  storeUrl: string | null;
  /** The `/join` link's offer, if one is in play — see {@link OnboardingCoupon}. */
  coupon: OnboardingCoupon;
}

/** The state a signed-out visitor sees: step 1, nothing else. */
export const ANONYMOUS_STATE: OnboardingState = {
  authenticated: false,
  currentStep: 'account',
  completedSteps: [],
  status: 'in_progress',
  user: null,
  store: null,
  shipstation: {
    connected: false,
    skipped: false,
    maskedKey: null,
    warehouseCount: null,
    planLimited: false,
    checkedAt: null,
  },
  importProgress: {
    status: 'idle',
    found: 0,
    total: null,
    imported: 0,
    failed: 0,
    skus: 0,
    warehouses: 0,
    page: 1,
    hasMore: true,
  },
  theme: { presetId: null, persistedTo: null },
  storeUrl: null,
  coupon: NO_ONBOARDING_COUPON,
};

export type { StepId };
