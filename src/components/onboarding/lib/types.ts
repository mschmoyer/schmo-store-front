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
    imported: 0,
    failed: 0,
    skus: 0,
    warehouses: 0,
    page: 1,
    hasMore: true,
  },
  theme: { presetId: null, persistedTo: null },
  storeUrl: null,
};

export type { StepId };
