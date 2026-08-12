/**
 * The single HTTP entry point to the ShipStation V2 API.
 *
 * Every ShipStation call in the product routes through {@link shipStationFetch}. Before this
 * existed there were a dozen hand-rolled `fetch` calls, each with its own idea of what a failure
 * meant: a 429 on the product page loop aborted the whole sync, while a 429 on the inventory loop
 * inside the *same function* was silently read as "no more pages" and produced wrong stock counts
 * (audit P1-1). Centralising the call makes that class of inconsistency structurally impossible.
 *
 * Behaviour:
 *
 * - Retries `429` and `5xx` (and network-level failures) with exponential backoff plus jitter.
 * - Honours `Retry-After`, in both its seconds and HTTP-date forms, capped so a hostile or
 *   mistaken header cannot pin a serverless invocation open.
 * - Never retries `4xx` other than `429` — those are our bug, not ShipStation's weather.
 * - Returns a discriminated result rather than throwing, so callers must handle failure.
 * - Never logs the API key, not even a prefix (audit P1-7).
 *
 * The network boundary is injectable (`fetchImpl`, `sleepImpl`) so the retry/backoff logic can be
 * unit-tested for real instead of being mocked away.
 */

export const SHIPSTATION_API_BASE = 'https://api.shipstation.com';

/** Options accepted by {@link shipStationFetch}. */
export interface ShipStationFetchOptions {
  /** ShipStation V2 API key. Sent as the `api-key` header, per the OpenAPI contract. */
  apiKey: string;
  /** HTTP method. Defaults to `GET`. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON request body. Serialised by this helper. */
  body?: unknown;
  /** Extra headers. Cannot override `api-key`. */
  headers?: Record<string, string>;
  /** Attempts *including* the first. Defaults to 4. */
  maxAttempts?: number;
  /** Base backoff in milliseconds. Defaults to 500. */
  baseDelayMs?: number;
  /** Ceiling for any single backoff wait. Defaults to 20000. */
  maxDelayMs?: number;
  /** Per-attempt timeout in milliseconds. Defaults to 20000. */
  timeoutMs?: number;
  /** Injected fetch, for tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Injected sleep, for tests. Defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injected jitter source in [0,1), for deterministic tests. Defaults to `Math.random`. */
  randomImpl?: () => number;
  /** Label used in log lines. Defaults to the request path. */
  operation?: string;
}

/** A successful ShipStation response, already parsed. */
export interface ShipStationSuccess<T> {
  ok: true;
  status: number;
  data: T;
  /** Attempts consumed, including the successful one. */
  attempts: number;
}

/** A failed ShipStation call, after all retries were exhausted or a permanent error was seen. */
export interface ShipStationFailure {
  ok: false;
  /** HTTP status, or 0 for a network/timeout failure. */
  status: number;
  error: string;
  /** True when a further retry could plausibly succeed (429, 5xx, network). */
  retryable: boolean;
  attempts: number;
  /** Raw response body, truncated. Useful for operator diagnostics. */
  body?: string;
}

/** Result of a ShipStation call. */
export type ShipStationResult<T> = ShipStationSuccess<T> | ShipStationFailure;

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BODY_LOG_CHARS = 2_000;

/**
 * Sleep for a number of milliseconds.
 *
 * @param ms - Duration.
 * @returns A promise resolving after the delay.
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse a `Retry-After` header into milliseconds.
 *
 * Supports both forms the RFC allows: delta-seconds and an HTTP date.
 *
 * @param header - Raw header value, or null.
 * @returns Milliseconds to wait, or null when absent/unparseable/in the past.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) {
    return null;
  }

  const trimmed = header.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

/**
 * Compute the wait before the next attempt.
 *
 * `Retry-After` wins when present and sane; otherwise exponential backoff with full jitter, which
 * avoids a fleet of serverless functions retrying in lockstep after a shared 429.
 *
 * @param attempt - 1-based number of the attempt that just failed.
 * @param retryAfterMs - Server-provided hint, if any.
 * @param baseDelayMs - Backoff base.
 * @param maxDelayMs - Ceiling applied to whichever source wins.
 * @param random - Jitter source in [0,1).
 * @returns Milliseconds to wait.
 */
export function computeBackoffMs(
  attempt: number,
  retryAfterMs: number | null,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number
): number {
  if (retryAfterMs !== null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }

  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jittered = exponential * (0.5 + random() * 0.5);

  return Math.min(Math.round(jittered), maxDelayMs);
}

/**
 * Decide whether a status code is worth retrying.
 *
 * @param status - HTTP status code.
 * @returns True for 429 and 5xx.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Call the ShipStation V2 API with retry, backoff and rate-limit handling.
 *
 * @param path - Path beginning with `/v2/...`, or an absolute ShipStation URL.
 * @param options - Request and retry configuration.
 * @returns A success carrying the parsed body, or a failure describing what went wrong.
 */
export async function shipStationFetch<T = unknown>(
  path: string,
  options: ShipStationFetchOptions
): Promise<ShipStationResult<T>> {
  const {
    apiKey,
    method = 'GET',
    body,
    headers = {},
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    randomImpl = Math.random,
    operation
  } = options;

  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      error: 'No ShipStation API key supplied',
      retryable: false,
      attempts: 0
    };
  }

  const url = path.startsWith('http') ? path : `${SHIPSTATION_API_BASE}${path}`;
  const label = operation ?? `${method} ${path}`;

  let lastFailure: ShipStationFailure = {
    ok: false,
    status: 0,
    error: 'Request was never attempted',
    retryable: false,
    attempts: 0
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          ...headers,
          'api-key': apiKey,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });

      const text = await response.text();

      if (response.ok) {
        let parsed: T;
        try {
          parsed = (text.length > 0 ? JSON.parse(text) : {}) as T;
        } catch {
          return {
            ok: false,
            status: response.status,
            error: 'ShipStation returned a non-JSON success body',
            retryable: false,
            attempts: attempt,
            body: text.slice(0, MAX_BODY_LOG_CHARS)
          };
        }

        return { ok: true, status: response.status, data: parsed, attempts: attempt };
      }

      const retryable = isRetryableStatus(response.status);
      lastFailure = {
        ok: false,
        status: response.status,
        error: `ShipStation ${label} failed: HTTP ${response.status}`,
        retryable,
        attempts: attempt,
        body: text.slice(0, MAX_BODY_LOG_CHARS)
      };

      if (!retryable || attempt === maxAttempts) {
        return lastFailure;
      }

      const waitMs = computeBackoffMs(
        attempt,
        parseRetryAfter(response.headers.get('retry-after')),
        baseDelayMs,
        maxDelayMs,
        randomImpl
      );

      console.warn(
        `ShipStation ${label}: HTTP ${response.status}, retrying in ${waitMs}ms ` +
          `(attempt ${attempt}/${maxAttempts})`
      );
      await sleepImpl(waitMs);
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const message = isAbort
        ? `ShipStation ${label} timed out after ${timeoutMs}ms`
        : `ShipStation ${label} network error: ${
            error instanceof Error ? error.message : 'unknown'
          }`;

      lastFailure = { ok: false, status: 0, error: message, retryable: true, attempts: attempt };

      if (attempt === maxAttempts) {
        return lastFailure;
      }

      const waitMs = computeBackoffMs(attempt, null, baseDelayMs, maxDelayMs, randomImpl);
      console.warn(`${message}; retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleepImpl(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }

  return lastFailure;
}
