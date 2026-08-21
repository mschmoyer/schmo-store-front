/**
 * Where the session signing key comes from, and when the app refuses to start without one.
 *
 * Deliberately free of any JWT dependency, for the same reason `./session-cookie` is: `./session`
 * pulls in `jose`, which is ESM and cannot be re-imported under a Jest module registry. Keeping
 * this rule in a module of its own means the rule can be *tested* — and a security control nobody
 * can write a test for is a security control nobody can prove.
 */

/**
 * The signing key this codebase used to fall back to when `JWT_SECRET` was unset.
 *
 * It is a literal committed to this repository, so it is not a secret in any sense: anyone reading
 * the source can mint a session naming any user id. That was survivable while every session was
 * scoped to one store by a `storeId` in the `WHERE` clause. It stopped being survivable when
 * `/platform` shipped, because the operator console reads across every tenant and the only thing
 * in front of it is this signature.
 *
 * Note what does *not* save you here: the platform guard re-reads `users.is_admin` from the
 * database rather than trusting the token, which is the right design — but a forger does not claim
 * to be an admin, they claim to *be the admin*, and the database agrees.
 */
export const PUBLIC_FALLBACK_SECRET = 'your-secret-key-here';

/** Shorter than this in production and the process refuses to start. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Resolve the session signing key, failing closed in production.
 *
 * `JWT_SECRET` joins `SHIPSTATION_ENCRYPTION_KEY` as a variable that refuses to degrade. Every
 * integration in this codebase is required to render a labelled "not configured" state when its
 * key is missing, and for Stripe or ShipStation that is right: an unconfigured integration should
 * be visibly inert. Authentication cannot be inert. A missing key there does not disable sign-in —
 * it signs every session with a value published in this file, and the deployment comes up looking
 * perfectly healthy. Loud and broken beats quiet and forgeable.
 *
 * Outside production the fallback stands, because dev and CI run without ceremony and parts of the
 * unit suite sign tokens with it deliberately. `scripts/dev-local.js` already writes a random
 * 32-byte value into `.env.local`, so a local developer gets a real key without noticing.
 *
 * @param env - The environment to read. Defaults to `process.env`; injectable so the rule can be
 *              tested without mutating the real environment.
 * @returns The signing key to use.
 * @throws If running in production with a missing, published, or too-short key.
 */
export function resolveSigningKey(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET;

  if (env.NODE_ENV === 'production') {
    if (!configured || configured === PUBLIC_FALLBACK_SECRET) {
      throw new Error(
        'JWT_SECRET is not set. Every session would be signed with a key published in this ' +
          'repository, which lets anyone mint a session for any account — including a platform ' +
          `operator. Set JWT_SECRET to a random value of at least ${MIN_SECRET_LENGTH} characters.`
      );
    }
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET is ${configured.length} characters. Use at least ${MIN_SECRET_LENGTH} random ` +
          'characters.'
      );
    }
  }

  return configured || PUBLIC_FALLBACK_SECRET;
}
