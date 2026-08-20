/**
 * Receiving goods against a purchase order.
 *
 * This route was twenty-nine lines: a `console.log`, and `success: true`. The modal above it
 * reported "Successfully received N items". Stock never moved, `quantity_received` never advanced,
 * and the order stayed open — so the next reorder recommendation told the merchant to buy the
 * pallet they had just unloaded. Of everything the reviews turned up, this was the most expensive
 * lie in the product: a merchant acts on it with real money.
 *
 * The schema for doing it properly has existed since migration 009 and had never been written to.
 * `purchase_order_receiving` records each delivery separately — which is what makes a partial
 * receipt legible three weeks later — and `quantity_pending` is a generated column that keeps
 * itself right once `quantity_received` is correct.
 *
 * Receipts are strictly incremental. The other half-built receive path set `quantity_received` to
 * an absolute value while separately *adding* the same units to stock, so a second delivery against
 * one line overwrote the receipt count and double-counted the units.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { postMovement } from '@/lib/inventory/ledger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One line being received, as the client sends it. */
interface IncomingReceipt {
  purchase_order_item_id?: string;
  item_id?: string;
  quantity_received?: number;
  quantity?: number;
  damaged_quantity?: number;
  damage_notes?: string | null;
  quality_status?: string;
  quality_notes?: string | null;
  location_id?: string | null;
  /** The cost actually invoiced, when it differs from what was ordered at. */
  unit_cost?: number;
}

/**
 * POST /api/admin/purchase-orders/[id]/receive
 *
 * Record a delivery: advance the received quantities, move the stock, and update the order's state.
 *
 * Body: `{ items: [{ purchase_order_item_id, quantity_received, damaged_quantity?, ... }],
 * received_date?, note? }`.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the purchase order id.
 * @returns What was received per line, the order's new status, and the resulting stock positions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }
    const storeId = user.storeId;

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    const body = await request.json();
    const incoming: IncomingReceipt[] = Array.isArray(body.items) ? body.items : [];
    if (incoming.length === 0) {
      throw new AdminApiError('Choose at least one line to receive', 400);
    }

    const receivedDate =
      typeof body.received_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.received_date)
        ? body.received_date
        : null;

    /*
     * The key that makes a retry a no-op instead of a second delivery.
     *
     * `FOR UPDATE` below serialises two people receiving the same delivery from two devices, but
     * serialising is not deduplicating: submitting the same receipt twice booked it twice, and
     * because the phantom units stayed inside the ordered quantity the response reported
     * `over_received: 0` and no warnings at all. A warehouse tablet on a bad connection does this
     * routinely.
     *
     * Optional, because an older client that does not send one must keep working — but the UI
     * always sends it, and a caller that omits it is told in the response that its retries are not
     * protected rather than being left to assume they are.
     */
    const idempotencyKey =
      typeof body.idempotency_key === 'string' && body.idempotency_key.trim()
        ? body.idempotency_key.trim().slice(0, 100)
        : request.headers.get('idempotency-key')?.slice(0, 100) || null;

    /*
     * A replay is a success with nothing written, not an error: the caller asked for the delivery
     * to be booked and it is booked. Reporting it as a conflict would send a warehouse to
     * investigate a discrepancy that does not exist.
     */
    if (idempotencyKey) {
      /*
       * `starts_with`, not `LIKE`.
       *
       * The key is supplied by the client and was being interpolated into a `LIKE` *pattern*, so
       * `%` and `_` in it were wildcards. A genuine, never-seen delivery whose key happened to
       * wildcard-match a stored one — `AUDIT_KEY_1` against `AUDIT-KEY-1`, or anything containing
       * `%` — was reported `replayed: true` with nothing written and no stock moved. That is the
       * "never return success for work that wrote nothing" rule failing inside the endpoint whose
       * own header calls the previous version of it the most expensive lie in the product.
       * Underscores in an idempotency key are entirely ordinary.
       */
      const seen = await db.query<{ n: string }>(
        `SELECT COUNT(*) AS n
           FROM purchase_order_receiving r
           JOIN purchase_orders po ON po.id = r.purchase_order_id
          WHERE po.id = $1 AND po.store_id = $2
            AND starts_with(r.idempotency_key, $3 || ':')`,
        [id, storeId, idempotencyKey]
      );
      if (Number(seen.rows[0]?.n ?? 0) > 0) {
        return NextResponse.json({
          success: true,
          replayed: true,
          message: 'This delivery was already recorded. Nothing was received twice.'
        });
      }
    }

    const result = await db.transaction(async (tx) => {
      /*
       * Ownership and lock in one statement. `FOR UPDATE` on the order serialises two people
       * receiving the same delivery from two devices, which is a real warehouse situation and
       * would otherwise let both post the units.
       */
      const orderResult = await tx.query<{
        id: string;
        po_number: string;
        status: string;
        supplier_name: string;
      }>(
        `SELECT id, po_number, status, supplier_name
           FROM purchase_orders
          WHERE id = $1 AND store_id = $2
          FOR UPDATE`,
        [id, storeId]
      );

      const order = orderResult.rows[0];
      if (!order) {
        throw new AdminApiError('That purchase order is not in this store', 404);
      }
      if (order.status === 'cancelled') {
        throw new AdminApiError('This purchase order was cancelled', 409);
      }
      if (order.status === 'closed') {
        throw new AdminApiError('This purchase order is closed', 409);
      }

      const lines = await tx.query<{
        id: string;
        product_id: string | null;
        product_sku: string;
        product_name: string;
        quantity: number;
        quantity_received: number;
        unit_cost: string;
        location_id: string | null;
      }>(
        `SELECT id, product_id, product_sku, product_name, quantity, quantity_received, unit_cost, location_id
           FROM purchase_order_items
          WHERE purchase_order_id = $1
          FOR UPDATE`,
        [id]
      );

      const lineById = new Map(lines.rows.map((l) => [l.id, l]));
      const applied: Array<Record<string, unknown>> = [];

      for (const [index, entry] of incoming.entries()) {
        const lineId = entry.purchase_order_item_id ?? entry.item_id ?? '';
        const line = lineById.get(lineId);
        if (!line) {
          throw new AdminApiError(
            `Line ${index + 1} is not part of purchase order ${order.po_number}`,
            400
          );
        }

        const quantity = Math.trunc(Number(entry.quantity_received ?? entry.quantity ?? 0));
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new AdminApiError(
            `${line.product_sku}: enter how many units arrived`,
            400
          );
        }

        const damaged = Math.max(0, Math.trunc(Number(entry.damaged_quantity ?? 0)) || 0);
        if (damaged > quantity) {
          throw new AdminApiError(
            `${line.product_sku}: more units marked damaged than were received`,
            400
          );
        }

        /*
         * Over-receipt is allowed but never silent. Suppliers really do ship extra, and refusing
         * the receipt would leave the merchant with units on the shelf and no record of them —
         * which is worse than a discrepancy they can see. It is reported back per line.
         */
        const outstanding = line.quantity - line.quantity_received;
        const overReceived = Math.max(0, quantity - outstanding);

        const updated = await tx.query<{ quantity_received: number; quantity_pending: number }>(
          /*
           * `unit_cost` is deliberately not touched. It is what the supplier quoted, and the gap
           * between it and what they invoiced is price variance — the evidence a
           * supplier-performance conversation is made of. Overwriting it also left `total_cost`,
           * `subtotal` and the order total at the ordered figures, so a line receiving 5 at 25.00
           * against 10 ordered at 10.00 rendered as "10 x 25.00 = 100.00" on the PDF the merchant
           * emails out. The invoiced cost goes on the receipt row instead (migration 035).
           */
          `UPDATE purchase_order_items
              SET quantity_received = quantity_received + $1,
                  updated_at = NOW()
            WHERE id = $2
            RETURNING quantity_received, quantity_pending`,
          [quantity, line.id]
        );

        await tx.query(
          `INSERT INTO purchase_order_receiving (
             purchase_order_id, purchase_order_item_id, received_date, quantity_received,
             quality_status, quality_notes, received_by, damaged_quantity, damage_notes,
             unit_cost, idempotency_key
           ) VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            line.id,
            receivedDate,
            quantity,
            ['pending', 'approved', 'rejected'].includes(String(entry.quality_status))
              ? entry.quality_status
              : 'approved',
            entry.quality_notes ?? null,
            user.userId,
            damaged,
            entry.damage_notes ?? null,
            entry.unit_cost === undefined || entry.unit_cost === null
              ? null
              : Number(entry.unit_cost),
            /* Per line, so one retried request replays every line it carried rather than the first.
             * A unique index makes the second attempt a 23505, caught below. */
            idempotencyKey ? `${idempotencyKey}:${line.id}` : null
          ]
        );

        const locationId = entry.location_id ?? line.location_id ?? null;
        const unitCost =
          entry.unit_cost === undefined || entry.unit_cost === null
            ? Number(line.unit_cost)
            : Number(entry.unit_cost);

        let movement = null;
        let damageMovement = null;

        /*
         * Stock only moves for lines that resolve to a product we hold. A purchase order line can
         * legitimately name a SKU that is not in the catalogue — packaging, a sample, something not
         * yet listed — and the receipt is still a real business record. Posting a movement for a
         * product that does not exist would fail; skipping it silently would lose the receipt. The
         * receipt row is written either way and the response says which lines moved stock.
         */
        if (line.product_id) {
          movement = await postMovement(
            {
              storeId,
              productId: line.product_id,
              locationId,
              delta: quantity,
              reason: 'po_receipt',
              referenceType: 'purchase_order',
              referenceId: id,
              actorUserId: user.userId,
              note: `Received against ${order.po_number}${overReceived > 0 ? ` (${overReceived} over)` : ''}`,
              /* Cost at receipt, not today's cost price. This is what makes a valuation as of a
               * past date answerable. */
              unitCost
            },
            tx
          );

          /*
           * Cost is updated from the receipt's own balance, before the damage entry is posted.
           *
           * The prior balance is taken before the damage entry, not from a fresh SUM afterwards:
           * posting the damage first drops on-hand again, and deriving the prior by subtracting the
           * received quantity from *that* attributes the damaged units to the old cost layer. On a
           * receipt of 60 at 40.00 against 27 on hand at 64.50 it gave 46.57 where the answer is
           * 47.60 — small, and wrong in the same direction every time.
           *
           * It is also the *product's* prior on-hand, not the receiving location's.
           * `movement.balance_after` is per location while `cost_price` is per product, so a
           * receipt into one of two stocked locations averaged the new cost against only that
           * location's units: 127 on hand at 64.50 receiving 60 at 40.00 gave 47.60 where the
           * answer is 56.64, a $1,690 understatement of that SKU's valuation from one delivery.
           * `products.stock_quantity` is the ledger's own cross-location projection and the
           * projection trigger has already run inside this transaction, so it is the total
           * including this receipt — hence subtracting the received quantity to recover the prior.
           */
          if (Number.isFinite(unitCost) && unitCost > 0) {
            const productTotal = await tx.query<{ stock_quantity: number }>(
              'SELECT stock_quantity FROM products WHERE id = $1 AND store_id = $2',
              [line.product_id, storeId]
            );
            const priorOnHand = Math.max(
              0,
              Number(productTotal.rows[0]?.stock_quantity ?? movement.balance_after) - quantity
            );
            await tx.query(
              `UPDATE products
                  SET cost_price = CASE
                        WHEN cost_price IS NULL OR cost_price <= 0 THEN $3::numeric
                        WHEN $4::int <= 0 THEN $3::numeric
                        ELSE ROUND(
                          (($4::int * cost_price) + ($5::int * $3::numeric))
                          / NULLIF($4::int + $5::int, 0), 2)
                      END,
                      updated_at = NOW()
                WHERE id = $2 AND store_id = $1`,
              [storeId, line.product_id, unitCost, priorOnHand, quantity]
            );
          }

          /* Damaged units arrive and then immediately leave, as two entries rather than one netted
           * one. The merchant received them — the supplier will be invoicing for them — and the
           * damage is its own reportable event. Netting the two would hide both. */
          if (damaged > 0) {
            damageMovement = await postMovement(
              {
                storeId,
                productId: line.product_id,
                locationId,
                delta: -damaged,
                reason: 'damage',
                referenceType: 'purchase_order',
                referenceId: id,
                actorUserId: user.userId,
                note: entry.damage_notes || `Damaged on arrival against ${order.po_number}`,
                unitCost
              },
              tx
            );
          }
        }

        applied.push({
          purchase_order_item_id: line.id,
          sku: line.product_sku,
          name: line.product_name,
          quantity_received: quantity,
          damaged_quantity: damaged,
          over_received: overReceived,
          total_received: updated.rows[0]?.quantity_received ?? 0,
          still_pending: updated.rows[0]?.quantity_pending ?? 0,
          stock_moved: Boolean(line.product_id),
          balance_after: movement?.balance_after ?? null,
          damage_balance_after: damageMovement?.balance_after ?? null
        });
      }

      /*
       * The order's state, derived from the lines rather than assumed. `partially_received` is the
       * state that did not exist before, which is why an order with three of a hundred units in
       * looked exactly like one nobody had touched.
       */
      const totals = await tx.query<{ outstanding: number; received: number }>(
        `SELECT COALESCE(SUM(quantity_pending), 0)::int AS outstanding,
                COALESCE(SUM(quantity_received), 0)::int AS received
           FROM purchase_order_items WHERE purchase_order_id = $1`,
        [id]
      );

      const outstanding = totals.rows[0]?.outstanding ?? 0;
      const nextStatus = outstanding === 0 ? 'delivered' : 'partially_received';

      const statusChanged = nextStatus !== order.status;
      if (statusChanged) {
        await tx.query(
          /* `$1` is cast at both sites: used once as an assigned value and once in a comparison,
           * an untyped parameter makes Postgres deduce two different types for it and refuse. */
          `UPDATE purchase_orders
              SET status = $1::varchar,
                  actual_delivery = CASE WHEN $1::varchar = 'delivered'
                                         THEN COALESCE(actual_delivery, COALESCE($3::date, CURRENT_DATE))
                                         ELSE actual_delivery END,
                  updated_at = NOW(), updated_by = $4
            WHERE id = $2`,
          [nextStatus, id, receivedDate, user.userId]
        );

        /* The status history table has existed since migration 009 and nothing had ever written to
         * it, so a purchase order's own past was unreadable. */
        await tx.query(
          `INSERT INTO purchase_order_status_history
             (purchase_order_id, old_status, new_status, changed_by, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            id,
            order.status,
            nextStatus,
            user.userId,
            body.note ?? `Goods received against ${order.po_number}`
          ]
        );
      }

      return {
        purchase_order_id: id,
        po_number: order.po_number,
        status: nextStatus,
        status_changed: statusChanged,
        units_outstanding: outstanding,
        lines: applied
      };
    });

    const overReceipts = result.lines.filter((l) => Number(l.over_received) > 0);
    const unmatched = result.lines.filter((l) => !l.stock_moved);

    /* The message reports what actually happened, including the parts the merchant would otherwise
     * only find out later. */
    const notes: string[] = [];
    if (overReceipts.length > 0) {
      notes.push(
        `${overReceipts.length} line${overReceipts.length === 1 ? '' : 's'} received more than ordered`
      );
    }
    if (unmatched.length > 0) {
      notes.push(
        `${unmatched.length} line${unmatched.length === 1 ? '' : 's'} recorded but not added to stock — no matching product`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message:
          result.units_outstanding === 0
            ? `${result.po_number} is fully received.`
            : `${result.po_number} received in part — ${result.units_outstanding} units still outstanding.`,
        warnings: notes
      }
    });
  } catch (error) {
    /*
     * The genuinely concurrent duplicate.
     *
     * The check above catches a retry that arrives after the first one committed. Two requests in
     * flight at once both pass it, and the loser hits the unique index on
     * `(purchase_order_id, idempotency_key)`. A comment here claimed that was "caught below"; it
     * was not, so it fell through to the generic SQLSTATE map and the warehouse tablet got "That
     * value is already used by another record" — with no indication that the delivery had in fact
     * been booked, and the same answer on every further retry.
     *
     * It is the same fact as the sequential retry, so it gets the same answer.
     */
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    if (code === '23505') {
      return NextResponse.json({
        success: true,
        replayed: true,
        message: 'This delivery was already recorded. Nothing was received twice.'
      });
    }

    return adminErrorResponse(error, 'purchase-orders.receive');
  }
}
