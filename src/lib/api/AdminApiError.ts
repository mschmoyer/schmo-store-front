/**
 * An error a route raises on purpose, carrying a message written for a merchant to read.
 *
 * Kept apart from `./adminError` — which builds the HTTP response and therefore imports
 * `next/server` — so that pure validation logic can throw one without pulling the framework in.
 * Anything that runs in a unit test or in the browser wants this module, not that one.
 */

/** An error a route raises deliberately, whose message is safe to show the caller. */
export class AdminApiError extends Error {
  readonly status: number;

  /**
   * @param message - Text written for a merchant to read. Never interpolate database output here.
   * @param status - The HTTP status to answer with.
   */
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}
