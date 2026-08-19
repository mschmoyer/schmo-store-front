/**
 * Server-side onboarding state: load, create, mutate.
 *
 * Progress lives in `onboarding_sessions` (migration 020), one row per user,
 * keyed off the user row created at step 1. Every route in
 * `src/app/api/onboarding/**` reads and writes through here so the state
 * machine has exactly one implementation.
 */

import { db } from '@/lib/database/connection';
import { SESSION_COOKIE, verifySession, type UserSession } from '@/lib/auth/session';
import {
  asStepId,
  completeStep as advance,
  sortSteps,
  type OnboardingProgress,
  type StepId,
} from '@/components/onboarding/lib/steps';
import type {
  ImportProgress,
  OnboardingState,
  OnboardingShipStation,
} from '@/components/onboarding/lib/types';

/** Cookie the login route already sets. Onboarding reuses it verbatim. */
export { SESSION_COOKIE };

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
 * Read the signed-in user from the request's session cookie.
 *
 * @param request - Incoming request
 * @returns The session, or null when signed out
 */
export async function readSession(request: Request): Promise<UserSession | null> {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  if (!token) return null;
  return verifySession(token);
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
  shipstation_username: string | null;
  custom_store_enabled: boolean | null;
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

  let shipstation: OnboardingShipStation = {
    connected: false,
    skipped: data.shipstationSkipped === true,
    maskedKey: typeof data.shipstationMaskedKey === 'string' ? data.shipstationMaskedKey : null,
    warehouseCount:
      typeof data.shipstationWarehouses === 'number' ? data.shipstationWarehouses : null,
    planLimited: data.shipstationPlanLimited === true,
    checkedAt: typeof data.shipstationCheckedAt === 'string' ? data.shipstationCheckedAt : null,
    catalogKeyPresent: false,
  };

  if (row.store_id) {
    const integration = await db.query<IntegrationRow>(
      `SELECT configuration, is_active, api_key_encrypted,
              shipstation_username, custom_store_enabled
         FROM store_integrations
        WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [row.store_id]
    );
    const found = integration.rows[0];

    // The two ShipStation halves are tracked separately because they are separate
    // capabilities, and a merchant can legitimately have one without the other.
    // `connected` is the Custom Store feed — orders out, tracking back — which is
    // what step 3 sets up. `catalogKeyPresent` is the V2 REST key, which is the
    // only thing that can pull products and stock, and is asked for at the import
    // step where it is actually used. Conflating them is what made a store with a
    // catalogue key look "connected" for orders it could never receive.
    // A deliberate skip outranks the credentials existing. Step 3 issues them on
    // arrival so the merchant can see what to paste without clicking first, which
    // means *everyone* has credentials by the time they reach the Skip button —
    // clearing `skipped` here on their presence alone silently discarded the one
    // decision the merchant actually made.
    const customStoreReady = Boolean(found?.shipstation_username && found?.custom_store_enabled);
    if (customStoreReady && data.shipstationSkipped !== true) {
      shipstation = { ...shipstation, connected: true, skipped: false };
    }
    shipstation = {
      ...shipstation,
      catalogKeyPresent: Boolean(found?.is_active && found.api_key_encrypted),
    };
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
