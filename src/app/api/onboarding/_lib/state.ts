/**
 * Server-side onboarding state: load, create, mutate.
 *
 * Progress lives in `onboarding_sessions` (migration 020), one row per user,
 * keyed off the user row created at step 1. Every route in
 * `src/app/api/onboarding/**` reads and writes through here so the state
 * machine has exactly one implementation.
 */

import { db } from '@/lib/database/connection';
import { SESSION_COOKIE, resolveSession, type UserSession } from '@/lib/auth/session';
import {
  asStepId,
  completeStep as advance,
  sortSteps,
  type OnboardingProgress,
  type StepId,
} from '@/components/onboarding/lib/steps';
import {
  NO_ONBOARDING_COUPON,
  type ImportProgress,
  type OnboardingCoupon,
  type OnboardingCouponErrorReason,
  type OnboardingState,
  type OnboardingShipStation,
} from '@/components/onboarding/lib/types';
import { getPlatformCouponByCode, type PlatformCouponRecord } from '@/lib/platform/coupons';
import {
  describePlatformCoupon,
  isRedeemable,
  requiresPaymentMethod as computeRequiresPaymentMethod,
} from '@/lib/billing/platform-coupons';
import { attributeCoupon } from '@/lib/billing/coupon-claims';
import { PLATFORM_COUPON_COOKIE } from './coupon-cookie';

/** Cookie the login route already sets. Onboarding reuses it verbatim. */
export { SESSION_COOKIE };

// Re-exported for existing importers; lives in its own module — see coupon-cookie.ts.
export { PLATFORM_COUPON_COOKIE } from './coupon-cookie';

/** Every {@link OnboardingCouponErrorReason} value, for validating an untrusted query string. */
const COUPON_ERROR_REASONS: readonly OnboardingCouponErrorReason[] = [
  'unknown',
  'expired',
  'exhausted',
  'inactive',
  'already_claimed',
];

/**
 * Narrow an arbitrary string (typically `?coupon_error=`, which a visitor could hand-edit) to a
 * known reason.
 *
 * @param value - Candidate reason.
 * @returns The reason, or `null` when `value` names none — ignored rather than surfaced as a
 *   made-up state.
 */
function asCouponErrorReason(value: string | null): OnboardingCouponErrorReason | null {
  return value && (COUPON_ERROR_REASONS as readonly string[]).includes(value)
    ? (value as OnboardingCouponErrorReason)
    : null;
}

/**
 * Read the `/join` cookie off a request, manually (no `next/headers`), so this works from a plain
 * `Request` in tests too.
 *
 * @param request - Incoming request.
 * @returns The cookie's value, or `null` when absent.
 */
function readPlatformCouponCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLATFORM_COUPON_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(PLATFORM_COUPON_COOKIE.length + 1));
  return value || null;
}

/**
 * Describe a coupon for display, from the full database record.
 *
 * @param coupon - The coupon row.
 * @returns The `attributed: false` shape both {@link previewCouponForVisitor} and
 *   {@link attributeCouponFromCookie} build on.
 */
function describeCouponOffer(coupon: PlatformCouponRecord): OnboardingCoupon {
  return {
    code: coupon.code,
    offer: describePlatformCoupon(coupon),
    requiresPaymentMethod: computeRequiresPaymentMethod(coupon),
    errorReason: null,
    attributed: false,
  };
}

/**
 * Preview a `/join` link for a visitor who does not have an account yet. Writes nothing — only
 * describes the offer, since there is no user row yet to attribute anything to.
 *
 * @param request - Incoming request: read for the `/join` cookie, and for `?coupon_error=` on the
 *   URL when there is no cookie (the dead-link redirect `/join` produced).
 * @returns The coupon info to render, or {@link NO_ONBOARDING_COUPON} when there is nothing to show.
 */
export async function previewCouponForVisitor(request: Request): Promise<OnboardingCoupon> {
  const code = readPlatformCouponCookie(request);
  if (code) {
    try {
      const coupon = await getPlatformCouponByCode(code);
      if (!coupon) return { ...NO_ONBOARDING_COUPON, errorReason: 'unknown' };
      const redeemability = isRedeemable(coupon);
      if (redeemability.status !== 'ok') {
        return { ...NO_ONBOARDING_COUPON, errorReason: redeemability.status };
      }
      return describeCouponOffer(coupon);
    } catch (error) {
      console.error('[onboarding] coupon preview failed:', error);
      return NO_ONBOARDING_COUPON;
    }
  }

  const errorReason = asCouponErrorReason(new URL(request.url).searchParams.get('coupon_error'));
  return errorReason ? { ...NO_ONBOARDING_COUPON, errorReason } : NO_ONBOARDING_COUPON;
}

/** Fields written into `onboarding_sessions.data` to carry a coupon outcome across every later step. */
function couponDataPatch(outcome: OnboardingCoupon): Record<string, unknown> {
  return {
    couponCode: outcome.code,
    couponOffer: outcome.offer,
    couponRequiresPaymentMethod: outcome.requiresPaymentMethod,
    couponErrorReason: outcome.errorReason,
    couponAttributed: outcome.attributed,
  };
}

/**
 * Attribute the `/join` cookie's code to a freshly created account, the moment there is a user row
 * to hang it off. Called once from `POST /api/onboarding/account`, right after the user and
 * session exist.
 *
 * A coupon failure of any kind must never fail account creation: every failure this can produce —
 * unknown code, expired/inactive/exhausted, a lost race, even an unexpected exception — is caught
 * here and folded into the row's persisted `data.coupon*` fields rather than thrown.
 *
 * @param request - Incoming request, read for the `/join` cookie.
 * @param session - The just-created user.
 * @param row - The onboarding row just opened for them.
 * @returns The row, updated with whatever coupon outcome applies — unchanged when no cookie was
 *   present at all.
 */
export async function attributeCouponFromCookie(
  request: Request,
  session: UserSession,
  row: SessionRow
): Promise<SessionRow> {
  const code = readPlatformCouponCookie(request);
  if (!code) return row;

  let outcome: OnboardingCoupon;
  try {
    const coupon = await getPlatformCouponByCode(code);
    if (!coupon) {
      outcome = { ...NO_ONBOARDING_COUPON, errorReason: 'unknown' };
    } else {
      const redeemability = isRedeemable(coupon);
      if (redeemability.status !== 'ok') {
        outcome = { ...NO_ONBOARDING_COUPON, errorReason: redeemability.status };
      } else {
        const result = await attributeCoupon({
          couponId: coupon.id,
          userId: session.userId,
          source: 'link',
        });
        outcome =
          result.reason === 'ok'
            ? { ...describeCouponOffer(coupon), attributed: true }
            : { ...NO_ONBOARDING_COUPON, errorReason: result.reason };
      }
    }
  } catch (error) {
    // Not one of attributeCoupon's typed reasons; 'unknown' avoids inventing a sixth for the wizard.
    console.error('[onboarding/account] coupon attribution failed:', error);
    outcome = { ...NO_ONBOARDING_COUPON, errorReason: 'unknown' };
  }

  return persist(row, { data: couponDataPatch(outcome) });
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  store_id: string | null;
  current_step: string;
  completed_steps: string[] | null;
  status: string;
  data: Record<string, unknown> | null;
  import_state: Record<string, unknown> | null;
}

/** Everything a route needs about who is asking. */
export interface OnboardingContext {
  session: UserSession;
  row: SessionRow;
}

/**
 * Read the signed-in user from whichever transport is currently valid.
 *
 * Delegates to {@link resolveSession} so onboarding sees exactly what `requireAuth` sees: a Clerk
 * session when Clerk is configured, and a legacy cookie/Bearer token *only* while native login is
 * enabled. Reading the cookie directly here was a kill-switch bypass — a stale legacy JWT kept
 * authenticating the ShipStation-credential and store-create steps after `ENABLE_NATIVE_LOGIN` was
 * turned off — and it left the Clerk sign-up path 401ing at step 2 because it never consulted Clerk.
 *
 * @param request - Incoming request
 * @returns The session, or null when signed out
 */
export async function readSession(request: Request): Promise<UserSession | null> {
  return resolveSession(request);
}

const DEFAULT_IMPORT: ImportProgress = {
  status: 'idle',
  found: 0,
  total: null,
  imported: 0,
  failed: 0,
  skus: 0,
  warehouses: 0,
  page: 1,
  hasMore: true,
};

/**
 * Normalise whatever is in `import_state` into a full {@link ImportProgress}.
 * Old or partial rows must never crash the wizard.
 *
 * @param raw - The `import_state` jsonb column
 * @returns A complete progress object
 */
export function readImportProgress(raw: unknown): ImportProgress {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_IMPORT };
  const value = raw as Partial<ImportProgress>;
  const status: ImportProgress['status'] =
    value.status === 'running' ||
    value.status === 'complete' ||
    value.status === 'partial' ||
    value.status === 'failed' ||
    value.status === 'skipped'
      ? value.status
      : 'idle';
  // A row written before the catalog size was tracked has no `total`. That is
  // "unknown", which the bar renders as indeterminate — it must not be coerced
  // to 0 or to `found`, either of which would be a false claim of progress.
  const total = Number(value.total);

  return {
    status,
    found: Number(value.found ?? 0) || 0,
    total: value.total === null || value.total === undefined || !Number.isFinite(total) ? null : total,
    imported: Number(value.imported ?? 0) || 0,
    failed: Number(value.failed ?? 0) || 0,
    skus: Number(value.skus ?? 0) || 0,
    warehouses: Number(value.warehouses ?? 0) || 0,
    page: Number(value.page ?? 1) || 1,
    hasMore: value.hasMore !== false,
    error: value.error ?? null,
    errorAction: value.errorAction ?? null,
    startedAt: value.startedAt ?? null,
    finishedAt: value.finishedAt ?? null,
  };
}

/**
 * Fetch (or lazily create) the onboarding row for a user.
 *
 * Lazy creation matters for merchants who signed up before this wizard existed:
 * they have a user and a store but no onboarding row, and they should resume at
 * the ShipStation step rather than be told to create an account they already
 * have.
 *
 * @param session - The signed-in user
 * @returns The onboarding row
 */
export async function loadOrCreateRow(session: UserSession): Promise<SessionRow> {
  const existing = await db.query<SessionRow>(
    `SELECT id, user_id, store_id, current_step, completed_steps, status, data, import_state
       FROM onboarding_sessions WHERE user_id = $1`,
    [session.userId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // No row: infer where this account already got to.
  const store = await db.query<{ id: string; is_public: boolean }>(
    'SELECT id, is_public FROM stores WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1',
    [session.userId]
  );
  const storeId = store.rows[0]?.id ?? null;
  const completed: StepId[] = storeId ? ['account', 'store'] : ['account'];
  const currentStep: StepId = storeId ? 'shipstation' : 'store';

  const inserted = await db.query<SessionRow>(
    `INSERT INTO onboarding_sessions (user_id, store_id, current_step, completed_steps, status)
     VALUES ($1, $2, $3, $4, 'in_progress')
     ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id, user_id, store_id, current_step, completed_steps, status, data, import_state`,
    [session.userId, storeId, currentStep, completed]
  );
  return inserted.rows[0];
}

/**
 * Resolve the request into a full onboarding context.
 *
 * @param request - Incoming request
 * @returns The context, or null when signed out
 */
export async function requireOnboarding(request: Request): Promise<OnboardingContext | null> {
  const session = await readSession(request);
  if (!session) return null;
  const row = await loadOrCreateRow(session);
  return { session, row };
}

/**
 * Turn a row into the progress triple the state machine operates on.
 *
 * @param row - Onboarding row
 * @returns Progress
 */
export function toProgress(row: SessionRow): OnboardingProgress {
  return {
    currentStep: asStepId(row.current_step, 'store'),
    completedSteps: sortSteps((row.completed_steps ?? []).map((id) => asStepId(id, 'account'))),
    status: row.status === 'completed' ? 'completed' : 'in_progress',
  };
}

export interface PersistOptions {
  /** Mark this step complete and move on. */
  complete?: StepId;
  /** Jump to a specific step (used by Back and by resume). */
  goTo?: StepId;
  /** Attach the store once it exists. */
  storeId?: string;
  /** Shallow-merged into the `data` column. */
  data?: Record<string, unknown>;
  /** Replaces the `import_state` column wholesale. */
  importState?: ImportProgress;
  /** Force the run to completed and stamp `completed_at`. */
  finish?: boolean;
}

/**
 * Apply a state transition and write it back.
 *
 * @param row - The row being mutated
 * @param options - {@link PersistOptions}
 * @returns The updated row
 */
export async function persist(row: SessionRow, options: PersistOptions): Promise<SessionRow> {
  let progress = toProgress(row);
  if (options.complete) progress = advance(progress, options.complete);
  if (options.goTo) progress = { ...progress, currentStep: options.goTo };

  const nextData = { ...(row.data ?? {}), ...(options.data ?? {}) };
  const nextImport = options.importState ?? readImportProgress(row.import_state);
  const finished = options.finish === true;

  const updated = await db.query<SessionRow>(
    `UPDATE onboarding_sessions
        SET current_step    = $2,
            completed_steps = $3,
            status          = $4,
            store_id        = COALESCE($5, store_id),
            data            = $6::jsonb,
            import_state    = $7::jsonb,
            completed_at    = CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE completed_at END,
            updated_at      = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, user_id, store_id, current_step, completed_steps, status, data, import_state`,
    [
      row.id,
      progress.currentStep,
      progress.completedSteps,
      finished ? 'completed' : progress.status,
      options.storeId ?? null,
      JSON.stringify(nextData),
      JSON.stringify(nextImport),
      finished,
    ]
  );
  return updated.rows[0];
}

interface StoreRow extends Record<string, unknown> {
  id: string;
  store_name: string;
  store_slug: string;
  store_description: string | null;
  is_public: boolean;
  theme_name: string | null;
}

interface IntegrationRow extends Record<string, unknown> {
  configuration: Record<string, unknown> | null;
  is_active: boolean;
  api_key_encrypted: string | null;
}

/**
 * Build the full client-facing state for a signed-in merchant.
 *
 * @param context - Resolved onboarding context
 * @param origin - Request origin, so the store URL we show actually resolves
 * @returns The state the wizard renders from
 */
export async function buildState(
  context: OnboardingContext,
  origin: string
): Promise<OnboardingState> {
  const { session, row } = context;
  const progress = toProgress(row);

  let store: OnboardingState['store'] = null;
  let themeName: string | null = null;
  if (row.store_id) {
    const result = await db.query<StoreRow>(
      `SELECT id, store_name, store_slug, store_description, is_public, theme_name
         FROM stores WHERE id = $1`,
      [row.store_id]
    );
    const found = result.rows[0];
    if (found) {
      themeName = found.theme_name;
      store = {
        id: String(found.id),
        name: String(found.store_name),
        slug: String(found.store_slug),
        description: found.store_description ?? '',
        isPublic: Boolean(found.is_public),
      };
    }
  }

  const data = (row.data ?? {}) as Record<string, unknown>;

  // Read back what `attributeCouponFromCookie` persisted — not the cookie — so this survives every
  // later step and a closed tab, not just the one request that happened to carry the cookie.
  const coupon: OnboardingCoupon = {
    code: typeof data.couponCode === 'string' ? data.couponCode : null,
    offer: typeof data.couponOffer === 'string' ? data.couponOffer : null,
    requiresPaymentMethod:
      typeof data.couponRequiresPaymentMethod === 'boolean' ? data.couponRequiresPaymentMethod : null,
    errorReason: asCouponErrorReason(
      typeof data.couponErrorReason === 'string' ? data.couponErrorReason : null
    ),
    attributed: data.couponAttributed === true,
  };

  let shipstation: OnboardingShipStation = {
    connected: false,
    skipped: data.shipstationSkipped === true,
    maskedKey: typeof data.shipstationMaskedKey === 'string' ? data.shipstationMaskedKey : null,
    warehouseCount:
      typeof data.shipstationWarehouses === 'number' ? data.shipstationWarehouses : null,
    planLimited: data.shipstationPlanLimited === true,
    checkedAt: typeof data.shipstationCheckedAt === 'string' ? data.shipstationCheckedAt : null,
  };

  if (row.store_id) {
    const integration = await db.query<IntegrationRow>(
      `SELECT configuration, is_active, api_key_encrypted
         FROM store_integrations
        WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [row.store_id]
    );
    const found = integration.rows[0];
    if (found?.is_active && found.api_key_encrypted) {
      shipstation = { ...shipstation, connected: true, skipped: false };
    }
  }

  return {
    authenticated: true,
    currentStep: progress.currentStep,
    completedSteps: progress.completedSteps,
    status: progress.status,
    user: {
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
    },
    store,
    shipstation,
    importProgress: readImportProgress(row.import_state),
    theme: {
      presetId: typeof data.themePreset === 'string' ? data.themePreset : null,
      persistedTo:
        data.themePersistedTo === 'storefront_themes'
          ? 'storefront_themes'
          : data.themePreset || themeName
            ? 'legacy_theme_name'
            : null,
    },
    storeUrl: store ? `${origin.replace(/\/$/, '')}/store/${store.slug}` : null,
    coupon,
  };
}

/**
 * Origin to build absolute URLs from. Prefers the forwarded host so the link we
 * hand the merchant is the one they are actually browsing.
 *
 * @param request - Incoming request
 * @returns An absolute origin with no trailing slash
 */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const host = forwardedHost ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(':', '');
  return `${protocol}://${host}`;
}

export type { SessionRow };
