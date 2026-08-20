/**
 * The signing secret for session and preview tokens.
 *
 * This module exists to make one rule enforceable in one place: **auth fails
 * closed.**
 *
 * Both `session.ts` and `storefront-theme/preview.ts` used to read
 * `process.env.JWT_SECRET || 'your-secret-key-here'`. In any environment where
 * the variable was unset, every session and preview token was therefore signed
 * with a string that is published in this repository — so anyone could mint a
 * token for any `storeId` and read or write any tenant's data. A missing
 * environment variable silently became a total cross-tenant compromise.
 *
 * `CLAUDE.md` says every integration must degrade gracefully rather than crash.
 * Authentication is the documented exception, alongside
 * `SHIPSTATION_ENCRYPTION_KEY`: a storefront whose payment provider is
 * unconfigured should render a labelled "not configured" state, but an app that
 * cannot tell users apart must not boot at all. Degrading here means forging
 * sessions, which is not a degraded service — it is an open door.
 *
 * The check runs at module load, so a misconfigured deployment fails on its
 * first request rather than at some later moment under attack.
 */

/**
 * Minimum acceptable length, in characters.
 *
 * HS256 keys shorter than the 32-byte hash output add no security over a
 * 32-byte one and are usually a human-chosen passphrase, which is the case that
 * actually gets brute-forced. `.env.example` documents generating one with
 * `openssl rand -base64 48`.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Secrets that are public knowledge and must never sign a token.
 *
 * The first is the old fallback literal from this repository's history; the
 * second is the placeholder `.env.example` ships. Both are long enough to pass
 * the length check, which is exactly why they need naming.
 */
const KNOWN_PLACEHOLDERS = new Set([
  'your-secret-key-here',
  'change-me-in-every-environment',
  'change-me-in-every-environment-please',
]);

/**
 * Read and validate `JWT_SECRET`.
 *
 * Under `NODE_ENV=test` a deterministic stand-in is returned instead of
 * throwing, so the unit suite needs no environment. That stand-in is not a
 * fallback for real environments: `NODE_ENV` is `test` only under Jest, and a
 * production build never takes this branch.
 *
 * @returns The validated secret
 * @throws When the secret is missing, too short, or a known placeholder
 */
function readJwtSecret(): string {
  const raw = process.env.JWT_SECRET?.trim();

  if (process.env.NODE_ENV === 'test' && !raw) {
    return 'test-only-jwt-secret-not-used-outside-jest-runs';
  }

  if (!raw) {
    throw new Error(
      'JWT_SECRET is not set. Sessions and preview tokens cannot be signed safely without it. ' +
        'Generate one with `openssl rand -base64 48` and add it to .env.local (see .env.example).',
    );
  }

  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is ${raw.length} characters; at least ${MIN_SECRET_LENGTH} are required. ` +
        'Generate one with `openssl rand -base64 48`.',
    );
  }

  if (KNOWN_PLACEHOLDERS.has(raw)) {
    throw new Error(
      'JWT_SECRET is still set to a placeholder value that appears in this repository. ' +
        'Anyone could forge a session for any store. Generate a real one with `openssl rand -base64 48`.',
    );
  }

  return raw;
}

/** The validated signing secret. Reading this module is the check. */
export const JWT_SECRET: string = readJwtSecret();
