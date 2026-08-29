/**
 * POST /api/admin/sync/shipments — pull shipment status and tracking back from ShipStation.
 *
 * The other five sync routes write to the catalogue. This one writes to `orders`: it reads
 * `GET /v2/shipments` over a 30-day modified-at window and matches each shipment to an order on
 * `external_shipment_id`, which is the order number `orderPush` sent. That is the only inbound
 * path for fulfilment other than the webhook, and until this route existed a merchant whose
 * webhook had never fired had no way to ask for it.
 *
 * It is not an order import. The V2 contract has no order resource, so nothing here can discover
 * an order that does not already exist locally — see `src/lib/shipstation/CLAUDE.md`.
 */

import { createSyncRoute } from '../_lib/singleOperationRoute';

/** Node runtime: the sync writers talk to Postgres. */
export const runtime = 'nodejs';

/** Never cached: this mutates. */
export const dynamic = 'force-dynamic';

/** Matches the `vercel.json` budget for `src/app/api/admin/sync/**`. */
export const maxDuration = 300;

export const POST = createSyncRoute(['shipments'], 'Shipments');
