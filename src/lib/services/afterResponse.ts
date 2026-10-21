/**
 * Post-response scheduling for store refresh and queue drains.
 *
 * WHY THIS EXISTS. Production Postgres is Neon, which scales to zero after a few idle minutes. A
 * `*\/5` queue-drain cron and an hourly sync cron kept it awake around the clock for stores nobody
 * was looking at. The replacement is event-driven: a storefront view refreshes that store (at most
 * once per `STORE_REFRESH_INTERVAL_MINUTES`), and a request that *enqueues* store-scoped work drains
 * that store's queue itself rather than waiting for a cron or a visitor. Both run inside Next's
 * `after()`, so the visitor, the shopper or the webhook sender is answered first and the work rides
 * on the same invocation via `waitUntil`.
 *
 * Two deliberate choices, both about never costing a request anything:
 *
 * - **`storeRefresh` is imported lazily, inside the callback.** It reaches the job queue, the
 *   ShipStation library and the snapshot service. Callers of this module include the storefront
 *   layout and route modules whose unit tests import them outside a request with `pg` mocked; a
 *   static import would drag that whole graph into every one of them at module load. Lazily, the
 *   graph is only resolved when the work actually runs, after the response.
 * - **Scheduling never throws.** `after()` throws when called outside a request scope. A refresh
 *   is a side effect; if it cannot be scheduled, the page or webhook acknowledgement must still go
 *   out. The failure is logged — no store data, no secrets — and the daily safety-net cron catches
 *   whatever was missed.
 *
 * The callbacks themselves rely on `refreshStoreIfStale` / `drainStoreQueue` never throwing (their
 * contract); the `.catch` here is defence in depth so a regression there cannot surface as an
 * unhandled rejection in the `waitUntil` promise.
 *
 * Server-only. Do not import from a client component — `next/server` and the lazily-loaded graph
 * have no business in a browser bundle (see the root CLAUDE.md on `JWT_SECRET` and the customizer).
 */

import { after } from 'next/server';

/**
 * Register a callback with `after()`, swallowing (and logging) a scheduling failure.
 *
 * @param label - Short description for the log line. Must not contain secrets.
 * @param work - The work to run once the response has been sent.
 * @returns Nothing.
 */
function scheduleAfterResponse(label: string, work: () => Promise<void>): void {
  try {
    after(() =>
      work().catch((error: unknown) => {
        console.error(
          `[after] ${label} failed:`,
          error instanceof Error ? error.message : 'unknown error'
        );
      })
    );
  } catch (error) {
    console.error(
      `[after] could not schedule ${label}:`,
      error instanceof Error ? error.message : 'unknown error'
    );
  }
}

/**
 * After the response is sent, refresh one store if its last refresh is stale.
 *
 * Everything — including the throttle check — happens after the response, so a storefront view
 * pays zero added latency. The throttle is an atomic database write inside `refreshStoreIfStale`,
 * so concurrent views of the same store run the refresh at most once per interval.
 *
 * @param storeId - The store being viewed.
 * @returns Nothing. Scheduling failures are logged, never thrown.
 */
export function scheduleStoreRefresh(storeId: string): void {
  scheduleAfterResponse(`store refresh for ${storeId}`, async () => {
    const { refreshStoreIfStale } = await import('./storeRefresh');
    await refreshStoreIfStale(storeId);
  });
}

/**
 * After the response is sent, drain this store's pending `job_queue` work (bounded).
 *
 * Call it from any route that has just enqueued store-scoped work — an order push, a shipment
 * notification, a retry — so that work does not wait for a storefront visitor or the daily cron.
 *
 * @param storeId - The store whose queue to drain. Never another tenant's.
 * @returns Nothing. Scheduling failures are logged, never thrown.
 */
export function scheduleStoreDrain(storeId: string): void {
  scheduleAfterResponse(`queue drain for ${storeId}`, async () => {
    const { drainStoreQueue } = await import('./storeRefresh');
    await drainStoreQueue(storeId);
  });
}
