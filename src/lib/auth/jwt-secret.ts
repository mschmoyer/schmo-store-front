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
 * **The check is lazy, and that is load-bearing.** The first version validated
 * at module load, and it broke the customizer: `Customizer.tsx` is a client
 * component that imports `previewUrl` from `@/lib/storefront-theme`, whose
 * index re-exports `preview.ts`, which imports this module. `process.env.JWT_SECRET`
 * is undefined in a browser bundle, so the throw fired on import and took the
 * whole preview pane down — six customizer e2e tests, green on `main`, red on
 * the branch. Validating on first *use* keeps the guarantee (nothing can sign
 * or verify with a bad secret) while leaving the import harmless anywhere the
 * secret is never touched, which is every client path.
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
 * others are placeholders `.env.example` has shipped. They are named rather
 * than left to the length check because the check they would trip tells the
 * operator the wrong thing: "too short" invites padding it, when the actual
 * problem is that the value is public.
 */
const KNOWN_PLACEHOLDERS = new Set([
  'your-secret-key-here',
  'change-me-in-every-environment',
  'change-me-in-every-environment-please',
]);

/** Cached after the first successful read. */
let cached: string | null = null;

/**
 * Read and validate `JWT_SECRET`.
 *
 * Call this at the point of signing or verifying, never at module scope — see
 * the note in this file's header about the customizer.
 *
 * Under `NODE_ENV=test` a deterministic stand-in is returned instead of
 * throwing, so the unit suite needs no environment. That stand-in is not a
 * fallback for real environments: `NODE_ENV` is `test` only under Jest, and a
 * production build never takes this branch.
 *
 * @returns The validated secret
 * @throws When the secret is missing, too short, or a known placeholder
 */
export function getJwtSecret(): string {
  if (cached !== null) return cached;

  const raw = process.env.JWT_SECRET?.trim();

  if (process.env.NODE_ENV === 'test' && !raw) {
    cached = 'test-only-jwt-secret-not-used-outside-jest-runs';
    return cached;
  }

  if (!raw) {
    throw new Error(
      'JWT_SECRET is not set. Sessions and preview tokens cannot be signed safely without it. ' +
        'Generate one with `openssl rand -base64 48` and add it to .env.local (see .env.example).',
    );
  }

  // Placeholders are checked *before* length. Both known ones are shorter than
  // the 32-character floor, so a length-first order made this branch
  // unreachable and reported "too short" for a secret whose real problem is
  // that it is published in this repository -- a much more useful thing to be
  // told, and a much more urgent one.
  if (KNOWN_PLACEHOLDERS.has(raw)) {
    throw new Error(
      'JWT_SECRET is still set to a placeholder value that appears in this repository. ' +
        'Anyone could forge a session for any store. Generate a real one with `openssl rand -base64 48`.',
    );
  }

  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is ${raw.length} characters; at least ${MIN_SECRET_LENGTH} are required. ` +
        'Generate one with `openssl rand -base64 48`.',
    );
  }

  cached = raw;
  return cached;
}

/**
 * Drop the cached secret. Tests only — nothing in the application rotates it.
 */
export function resetJwtSecretCache(): void {
  cached = null;
}
