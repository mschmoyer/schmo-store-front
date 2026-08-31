/**
 * Whether Clerk is configured, and whether the legacy password login is still open.
 *
 * Every read here is **lazy**, at call time, never at module load — the same rule
 * `jwt-secret.ts` documents at length. These helpers are imported from server routes *and*
 * (indirectly) from client-adjacent code, and a browser bundle has no `process.env`; a
 * module-scope read that throws or caches an empty value is the regression class that took the
 * customizer's preview pane down once already. Nothing here throws: an unconfigured Clerk is a
 * legitimate state (CI builds keyless, and so does this repository's dev container), it just means
 * nobody signs in through Clerk.
 *
 * Note that auth still fails closed. "Not configured" never means "everybody is authenticated" —
 * `requireAuth` simply finds no Clerk session, and falls back to the legacy path only while
 * {@link isNativeLoginEnabled} says that path exists.
 */

/**
 * Read an environment variable as a trimmed string.
 *
 * `process.env` is inlined by the bundler for the public key and absent entirely in a browser, so
 * an undefined value has to be as ordinary as an empty one.
 *
 * @param name - Variable to read.
 * @returns The trimmed value, or `''` when unset.
 */
function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/**
 * Whether Clerk is fully configured on the server.
 *
 * This is the server-side truth: both halves of the key pair must be present, because a
 * publishable key alone renders a sign-in widget that no route can verify a session from.
 *
 * @returns `true` when both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set.
 */
export function isClerkConfigured(): boolean {
  return env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') !== '' && env('CLERK_SECRET_KEY') !== '';
}

/**
 * Whether the publishable key is present.
 *
 * Safe to call from a client component: `CLERK_SECRET_KEY` is server-only and is never inlined
 * into a browser bundle, so {@link isClerkConfigured} always reports `false` there regardless of
 * how the deployment is set up. Client code that needs to decide between mounting Clerk's provider
 * and rendering a labelled "sign-in not configured" state asks this instead.
 *
 * @returns `true` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set.
 */
export function hasClerkPublishableKey(): boolean {
  return env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') !== '';
}

/**
 * Whether the legacy email/password login is still accepted.
 *
 * The homegrown login (`/api/auth/login`, `/api/admin/auth/login`, the `session` cookie and its
 * Bearer twin) lives on behind this flag through the dual-read window, so a bad Clerk step rolls
 * back by flipping one variable rather than by reverting a deploy. When it is off, those routes
 * 404 and `requireAuth` stops honouring legacy JWTs entirely — an old token in someone's browser
 * authenticates nothing.
 *
 * The default is deliberately asymmetric: **off in the production deployment, on everywhere else**.
 * Production is where the account-takeover surface and the un-revocable seven-day JWTs matter, and
 * where Clerk is actually configured; local, CI and preview environments have no production data at
 * stake, so defaulting them off would leave no way to sign in and would fail every existing test of
 * the login routes.
 *
 * "The production deployment" is decided by {@link isProductionDeployment}, not by `NODE_ENV`:
 * Vercel sets `NODE_ENV=production` for *preview* builds too, so keying the default off `NODE_ENV`
 * would lock QA out of every preview deploy. The explicit `true`/`false` value always wins, so a
 * production operator opting native login back on (the documented rollback lever) is one variable.
 *
 * @returns `true` when the legacy password paths are open.
 */
export function isNativeLoginEnabled(): boolean {
  const raw = env('ENABLE_NATIVE_LOGIN').toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return !isProductionDeployment();
}

/**
 * Whether this process is the production deployment, as opposed to a preview/dev/CI one.
 *
 * `VERCEL_ENV` is the authoritative signal on Vercel (`'production'` only for the production
 * deployment, `'preview'` for branch previews) — the repo already keys `cron-auth` and the health
 * route off it. Off Vercel `VERCEL_ENV` is unset, so a self-hosted `next start` is treated as
 * production whenever `NODE_ENV === 'production'`: that fails safe (native login defaults off there),
 * which an operator overrides with an explicit `ENABLE_NATIVE_LOGIN`.
 *
 * @returns `true` for the production deployment.
 */
export function isProductionDeployment(): boolean {
  const vercelEnv = env('VERCEL_ENV');
  if (vercelEnv) return vercelEnv === 'production';
  return process.env.NODE_ENV === 'production';
}
