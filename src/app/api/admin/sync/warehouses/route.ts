/**
 * POST /api/admin/sync/warehouses — sync ShipStation warehouses into `shipfroms`.
 */

import { createSyncRoute } from '../_lib/singleOperationRoute';

/** Node runtime: the sync writers talk to Postgres. */
export const runtime = 'nodejs';

/** Never cached: this mutates. */
export const dynamic = 'force-dynamic';

/** Matches the `vercel.json` budget for `src/app/api/admin/sync/**`. */
export const maxDuration = 300;

export const POST = createSyncRoute(['warehouses'], 'Warehouses');
