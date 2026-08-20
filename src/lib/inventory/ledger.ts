/**
 * The inventory write path.
 *
 * Every change to on-hand stock in this application goes through this module, and this module goes
 * through `post_inventory_movement` in the database. That is the whole point: one door, so the
 * balance and the reason for the balance can never disagree.
 *
 * What it refuses to do is as important as what it does.
 *
 * **It takes deltas, not quantities.** The old admin endpoint accepted an absolute `stock_quantity`
 * *and* a separate `quantity_change` for the log, both from the browser, with nothing reconciling
 * them — a caller could set stock to 500 and record a movement of +1. A delta is self-describing;
 * an absolute value cannot say what moved. Where a merchant genuinely wants to state a count
 * ("I counted 47 on the shelf"), {@link recountTo} converts it to a delta against the balance read
 * inside the same transaction, which is also the only way to do it without a lost update.
 *
 * **It never clamps.** On-hand is allowed to go negative. Clamping at zero is what erased oversells
 * before: the unclamped delta went into the log while the clamped balance went into the column, so
 * the two permanently disagreed and the discrepancy a cycle count exists to find was destroyed.
 */

import { db } from '@/lib/database/connection';
import type { PoolClient } from 'pg';
import { AdminApiError } from '@/lib/api/adminError';

/*
 * The reason vocabulary lives in `./reasons`, which has no database dependency so the admin's
 * adjustment form can import it too. Re-exported here because this is where server callers look.
 */
export { MANUAL_REASONS, requireManualReason } from './reasons';
export type { InventoryReason } from './reasons';

import type { InventoryReason } from './reasons';

/**
 * One posted movement, as returned by the database function.
 *
 * The index signature is there because `db.query<T>` constrains `T` to `Record<string, unknown>`;
 * without it a named interface cannot be used as a row type at all.
 */
export interface LedgerEntry {
  [column: string]: unknown;
  id: string;
  store_id: string;
  product_id: string;
  location_id: string;
  sku: string;
  reason: InventoryReason;
  delta: number;
  balance_after: number;
  unit_cost: string | null;
  reference_type: string | null;
  reference_id: string | null;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
}

/** Everything a movement needs to be posted and later understood. */
export interface MovementInput {
  storeId: string;
  productId: string;
  /** Signed. Positive adds to stock, negative removes. Zero is rejected. */
  delta: number;
  reason: InventoryReason;
  /** Defaults to the store's default location. */
  locationId?: string | null;
  /** What caused this — `order`, `purchase_order`, `manual`, `sync`. */
  referenceType?: string | null;
  referenceId?: string | null;
  /** Who did it. Null for anything the system posted on its own. */
  actorUserId?: string | null;
  note?: string | null;
  /** Cost at the time of the movement. Defaults to the product's current cost price. */
  unitCost?: number | null;
}

/**
 * Post one stock movement.
 *
 * @param input - The movement.
 * @param client - An open transaction to post within. Omit to run standalone.
 * @returns The ledger entry that was written, including the resulting balance.
 * @throws AdminApiError when the delta is zero or the product is not in the store.
 */
export async function postMovement(
  input: MovementInput,
  client?: PoolClient
): Promise<LedgerEntry> {
  const delta = Math.trunc(Number(input.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AdminApiError('Enter how many units moved', 400);
  }

  const sql =
    'SELECT * FROM post_inventory_movement($1, $2, $3, $4::inventory_reason, $5, $6, $7, $8, $9, $10)';
  const values = [
    input.storeId,
    input.productId,
    delta,
    input.reason,
    input.locationId ?? null,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.actorUserId ?? null,
    input.note ?? null,
    input.unitCost ?? null
  ];

  /* Branching rather than unioning the two runners: `db.query` and `PoolClient.query` have
   * different overload sets, and a union of them is not callable at all. */
  const result = client
    ? await client.query<LedgerEntry>(sql, values)
    : await db.query<LedgerEntry>(sql, values);

  const entry = result.rows[0];
  if (!entry) {
    /* The function raises rather than returning nothing, so this is defensive — but a silent
     * undefined here would become a "success" the caller reports for a movement that never
     * happened, which is the failure mode this whole change exists to end. */
    throw new AdminApiError('The stock movement could not be recorded', 500);
  }
  return entry;
}

/**
 * Set stock to a counted figure, expressed as the delta that gets there.
 *
 * This is what a stocktake does. Reading the current balance and computing the delta must happen
 * under the same lock as the write, or two overlapping counts each compute against a balance the
 * other has already changed — so the read is `FOR UPDATE` inside the caller's transaction.
 *
 * @param input - The movement, with `delta` replaced by the counted quantity.
 * @param countedQuantity - What the merchant physically counted.
 * @param client - An open transaction. Required: the read and the write must be atomic.
 * @returns The ledger entry, or null when the count matched and nothing moved.
 */
export async function recountTo(
  input: Omit<MovementInput, 'delta'>,
  countedQuantity: number,
  client: PoolClient
): Promise<LedgerEntry | null> {
  const counted = Math.trunc(Number(countedQuantity));
  if (!Number.isFinite(counted) || counted < 0) {
    throw new AdminApiError('A counted quantity cannot be negative', 400);
  }

  const locationId =
    input.locationId ??
    (
      await client.query<{ id: string }>(
        'SELECT id FROM inventory_locations WHERE store_id = $1 AND is_default LIMIT 1',
        [input.storeId]
      )
    ).rows[0]?.id;

  if (!locationId) {
    throw new AdminApiError('This store has no stock location to count against', 400);
  }

  const current = await client.query<{ on_hand: number }>(
    `SELECT on_hand FROM inventory_levels
      WHERE store_id = $1 AND product_id = $2 AND location_id = $3
      FOR UPDATE`,
    [input.storeId, input.productId, locationId]
  );

  const onHand = current.rows[0]?.on_hand ?? 0;
  const delta = counted - onHand;

  /* A count that agrees with the book is a real and useful outcome — it is most counts — and it is
   * not a movement. Posting a zero-delta row would be noise in the ledger and is refused by the
   * database anyway. */
  if (delta === 0) return null;

  return postMovement({ ...input, locationId, delta }, client);
}

/**
 * Move stock between two of a store's locations.
 *
 * Posted as a pair of entries sharing a reference id, so the transfer reads as one event in the
 * ledger and neither leg can exist without the other.
 *
 * @param params - The transfer.
 * @returns Both ledger entries, out first.
 */
export async function transferStock(params: {
  storeId: string;
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  actorUserId?: string | null;
  note?: string | null;
}): Promise<[LedgerEntry, LedgerEntry]> {
  const quantity = Math.trunc(Number(params.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AdminApiError('Enter how many units to transfer', 400);
  }
  if (params.fromLocationId === params.toLocationId) {
    throw new AdminApiError('Choose two different locations', 400);
  }

  return db.transaction(async (tx) => {
    const available = await tx.query<{ available: number }>(
      `SELECT available FROM inventory_levels
        WHERE store_id = $1 AND product_id = $2 AND location_id = $3
        FOR UPDATE`,
      [params.storeId, params.productId, params.fromLocationId]
    );

    if ((available.rows[0]?.available ?? 0) < quantity) {
      throw new AdminApiError(
        `Only ${available.rows[0]?.available ?? 0} units are available at the origin location`,
        409
      );
    }

    /* Both legs carry the same reference so the pair can be found and shown as one movement. */
    const referenceId = crypto.randomUUID();

    const out = await postMovement(
      {
        storeId: params.storeId,
        productId: params.productId,
        locationId: params.fromLocationId,
        delta: -quantity,
        reason: 'transfer_out',
        referenceType: 'transfer',
        referenceId,
        actorUserId: params.actorUserId,
        note: params.note
      },
      tx
    );

    const into = await postMovement(
      {
        storeId: params.storeId,
        productId: params.productId,
        locationId: params.toLocationId,
        delta: quantity,
        reason: 'transfer_in',
        referenceType: 'transfer',
        referenceId,
        actorUserId: params.actorUserId,
        note: params.note
      },
      tx
    );

    return [out, into];
  });
}

/**
 * Read a product's movement history.
 *
 * @param storeId - The tenant.
 * @param productId - The product.
 * @param limit - How many entries, newest first.
 * @param offset - Where to start.
 * @returns The ledger entries with the acting user's name where one is recorded.
 */
export async function readLedger(
  storeId: string,
  productId: string,
  limit = 50,
  offset = 0
): Promise<Array<LedgerEntry & { actor_name: string | null; location_name: string }>> {
  const result = await db.query<LedgerEntry & { actor_name: string | null; location_name: string }>(
    `SELECT t.*,
            NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS actor_name,
            l.name AS location_name
       FROM inventory_transactions t
       LEFT JOIN users u ON u.id = t.actor_user_id
       JOIN inventory_locations l ON l.id = t.location_id
      WHERE t.store_id = $1 AND t.product_id = $2
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $3 OFFSET $4`,
    [storeId, productId, limit, offset]
  );
  return result.rows;
}
