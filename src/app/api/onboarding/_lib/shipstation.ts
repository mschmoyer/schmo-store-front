/**
 * Real ShipStation credential validation for onboarding.
 *
 * ## Why this file exists
 *
 * `docs/audits/shipstation-audit.md` P0-2: the setup screen merchants are told
 * to use has a "Test Connection" button whose every check is a local regex —
 * its own comments say "we'll simulate". A key of thirty-two `a`s passes. The
 * first time an invalid key is actually exercised is a live customer checkout.
 *
 * This module does the opposite. It performs the same live request the one
 * genuinely-working checker in the codebase performs
 * (`src/app/api/admin/integrations/test/route.ts` →
 * `GET https://api.shipstation.com/v2/warehouses` with an `api-key` header),
 * and it reports what actually happened. There is no branch anywhere below that
 * returns success without a real HTTP response from ShipStation.
 *
 * ## Testability
 *
 * `fetchImpl` is injected. Tests substitute a fetch that returns a specific
 * status or throws a specific error, and then assert on the *classification*
 * logic in this file — the logic under test is never mocked away, only the
 * network is.
 */

/** ShipStation V2 endpoint we probe. Cheapest authenticated GET in the API. */
export const SHIPSTATION_PROBE_URL = 'https://api.shipstation.com/v2/warehouses';

/** How long we wait before calling it a timeout. Longer than ShipStation's
 *  p99 and shorter than any sane HTTP proxy's idle cut-off. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Shortest key we will even send. ShipStation V2 keys are long opaque strings;
 * anything under this is a paste error, and telling the merchant that
 * immediately beats spending 10 seconds proving it over the wire.
 *
 * This is a *pre-flight* only. It can reject, it can never accept.
 */
export const MIN_KEY_LENGTH = 20;

export type ShipStationCheckStatus =
  /** Authenticated and authorised. The catalog is reachable. */
  | 'connected'
  /** Key authenticated, but the account's plan blocks this endpoint. */
  | 'plan_limited'
  /** ShipStation said no. Wrong key, revoked key, wrong account. */
  | 'invalid_key'
  /** Key is valid but lacks the scope. */
  | 'forbidden'
  /** ShipStation is rate-limiting us. */
  | 'rate_limited'
  /** ShipStation answered, but with something we do not understand. */
  | 'unexpected'
  /** We never reached ShipStation. DNS, TLS, offline, blocked egress. */
  | 'network_error'
  /** We reached out and nothing came back in time. */
  | 'timeout'
  /** Failed our pre-flight; never sent. */
  | 'malformed';

export interface ShipStationCheckResult {
  status: ShipStationCheckStatus;
  /** Whether onboarding may proceed to the catalog import on this result. */
  ok: boolean;
  /** Merchant-facing sentence. Names what failed and whose fault it is. */
  message: string;
  /** The one thing they should do next. Copy deck §5.4 button labels. */
  action: string;
  /** HTTP status ShipStation returned, when it answered at all. */
  httpStatus?: number;
  /** Warehouses visible on the account — the first real proof of connection. */
  warehouseCount?: number;
  /** Engineer-facing detail. Never rendered as the whole message. */
  detail?: string;
}

/** Minimal shape of `fetch` this module needs. Keeps tests from having to
 *  construct a full DOM `fetch` signature. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<Response>;

export interface ValidateOptions {
  /** Injected for tests. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /** Injected for tests. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

interface ShipStationErrorBody {
  errors?: Array<{ message?: string; error_code?: string }>;
  message?: string;
}

/**
 * True when a 401 body is ShipStation telling us the *account* is limited
 * rather than the *key* being wrong. This distinction matters: the key is good,
 * the merchant just cannot read warehouses on their plan, and blocking them
 * would be wrong.
 *
 * @param body - Parsed ShipStation error body
 * @returns Whether the 401 is a plan/billing problem
 */
export function isPlanLimitedBody(body: ShipStationErrorBody | null): boolean {
  if (!body?.errors?.length) return false;
  return body.errors.some((error) => {
    const message = (error.message ?? '').toLowerCase();
    return (
      message.includes('billing') ||
      message.includes('upgrade') ||
      message.includes('plan') ||
      message.includes('subscription')
    );
  });
}

/**
 * Classify a ShipStation HTTP response into a merchant-facing result.
 *
 * Split out from the request so the branch table is directly testable without
 * any network involved at all.
 *
 * @param httpStatus - Status ShipStation returned
 * @param body - Parsed response body, or null when it was not JSON
 * @returns The classified result
 */
export function classifyResponse(
  httpStatus: number,
  body: (ShipStationErrorBody & { warehouses?: unknown[] }) | null
): ShipStationCheckResult {
  if (httpStatus >= 200 && httpStatus < 300) {
    const warehouseCount = Array.isArray(body?.warehouses) ? body.warehouses.length : 0;
    return {
      status: 'connected',
      ok: true,
      message: 'Connected. We can see your ShipStation account.',
      action: 'Continue',
      httpStatus,
      warehouseCount,
    };
  }

  if (httpStatus === 401 && isPlanLimitedBody(body)) {
    return {
      status: 'plan_limited',
      ok: true,
      message:
        'Your key works. ShipStation says this account’s plan does not include warehouse access, so we may see less than the full picture.',
      action: 'Continue anyway',
      httpStatus,
      detail: body?.errors?.[0]?.message,
    };
  }

  if (httpStatus === 401) {
    return {
      status: 'invalid_key',
      ok: false,
      message:
        'ShipStation rejected that key. Check that it’s an active API key from the right account.',
      action: 'Try again',
      httpStatus,
      detail: body?.errors?.[0]?.message ?? body?.message,
    };
  }

  if (httpStatus === 403) {
    return {
      status: 'forbidden',
      ok: false,
      message:
        'That key is valid but not allowed to read your catalog. Generate a key with full API access in ShipStation.',
      action: 'Try again',
      httpStatus,
      detail: body?.errors?.[0]?.message ?? body?.message,
    };
  }

  if (httpStatus === 429) {
    return {
      status: 'rate_limited',
      ok: false,
      message: 'ShipStation is rate-limiting us. Wait a minute and test again.',
      action: 'Retry',
      httpStatus,
    };
  }

  if (httpStatus >= 500) {
    return {
      status: 'unexpected',
      ok: false,
      message:
        'ShipStation had an error on their end. Your data is untouched — this usually clears on its own.',
      action: 'Retry',
      httpStatus,
    };
  }

  return {
    status: 'unexpected',
    ok: false,
    message: `ShipStation answered with an error we don’t recognise (HTTP ${httpStatus}).`,
    action: 'Try again',
    httpStatus,
    detail: body?.errors?.[0]?.message ?? body?.message,
  };
}

/**
 * Classify a thrown error from the fetch itself — nothing came back.
 *
 * @param error - Whatever `fetch` rejected with
 * @param aborted - Whether our own abort controller fired
 * @returns The classified result
 */
export function classifyThrown(error: unknown, aborted: boolean): ShipStationCheckResult {
  const detail = error instanceof Error ? error.message : String(error);

  if (aborted || (error instanceof Error && error.name === 'AbortError')) {
    return {
      status: 'timeout',
      ok: false,
      message:
        'ShipStation didn’t answer in time. Nothing was saved — this is usually a slow moment on their end.',
      action: 'Retry',
      detail,
    };
  }

  return {
    status: 'network_error',
    ok: false,
    message:
      'We couldn’t reach ShipStation. This is usually on their end — your data is untouched.',
    action: 'Retry',
    detail,
  };
}

/**
 * Validate a ShipStation API key by actually calling ShipStation.
 *
 * @param apiKey - The key the merchant pasted
 * @param options - {@link ValidateOptions}; inject `fetchImpl` in tests
 * @returns A classified, merchant-facing result. Never throws.
 */
export async function validateShipStationKey(
  apiKey: string,
  options: ValidateOptions = {}
): Promise<ShipStationCheckResult> {
  const key = apiKey.trim();

  if (!key) {
    return {
      status: 'malformed',
      ok: false,
      message: 'Enter your ShipStation API key',
      action: 'Try again',
    };
  }

  if (key.length < MIN_KEY_LENGTH) {
    return {
      status: 'malformed',
      ok: false,
      message: `That looks too short for a ShipStation key (${key.length} characters). Copy the whole value from Settings → Account → API Settings.`,
      action: 'Try again',
    };
  }

  if (/\s/.test(key)) {
    return {
      status: 'malformed',
      ok: false,
      message: 'That key contains a space. Paste it again without line breaks.',
      action: 'Try again',
    };
  }

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  let abortedByUs = false;
  const timer = setTimeout(() => {
    abortedByUs = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(SHIPSTATION_PROBE_URL, {
      method: 'GET',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    let body: (ShipStationErrorBody & { warehouses?: unknown[] }) | null = null;
    try {
      body = (await response.json()) as ShipStationErrorBody & { warehouses?: unknown[] };
    } catch {
      body = null;
    }

    return classifyResponse(response.status, body);
  } catch (error) {
    return classifyThrown(error, abortedByUs);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mask a key for display and for logs. We never render a merchant's key back to
 * them in full, and we never log it (audit P1-7: the existing integration test
 * route logs key fragments on every call).
 *
 * @param apiKey - The key
 * @returns Something like `••••••••2f9c`
 */
export function maskKey(apiKey: string): string {
  const key = apiKey.trim();
  if (key.length <= 4) return '•'.repeat(8);
  return `${'•'.repeat(8)}${key.slice(-4)}`;
}
