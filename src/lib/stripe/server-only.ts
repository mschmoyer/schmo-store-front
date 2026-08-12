/**
 * Server-only guard for the Stripe layer.
 *
 * The `server-only` npm package is not a dependency of this repo and installing packages is out of
 * scope here, so this module provides the equivalent protection at runtime: every entry point that
 * touches the Stripe secret key calls {@link assertServerOnly} first. If a Stripe module is ever
 * pulled into a client bundle, the failure is loud and immediate instead of leaking a secret.
 *
 * The check is a function rather than a module-level throw on purpose: importing a module must
 * never throw (pages must render without Stripe configured, and Jest runs in a jsdom environment
 * where `window` exists).
 */

/**
 * Throw if the caller is executing in a browser context.
 *
 * @param context - Short label naming the caller, used in the error message.
 * @throws Error when a `window` object is present outside of the test environment.
 */
export function assertServerOnly(context: string): void {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      `${context} is server-only and must never be imported into client code. ` +
        'Call it from a route handler, server component, or server action instead.'
    );
  }
}
