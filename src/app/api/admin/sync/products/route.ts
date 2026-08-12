/**
 * POST /api/admin/sync/products — sync the ShipStation product catalogue.
 */

import { createSyncRoute } from '../_lib/singleOperationRoute';

/** Node runtime: the sync writers talk to Postgres. */
export const runtime = 'nodejs';

/** Never cached: this mutates. */
export const dynamic = 'force-dynamic';

/** Matches the `vercel.json` budget for `src/app/api/admin/sync/**`. */
export const maxDuration = 300;

/**
 * `inventory` follows `products` so stock quantities land on rows that already exist — the old
 * route achieved the same thing by fetching the inventory feed itself and joining it in memory.
 */
export const POST = createSyncRoute(['products', 'inventory'], 'Products');
