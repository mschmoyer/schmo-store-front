/**
 * Guards on the inventory write path.
 *
 * Two kinds of test here. The first reads the shipped SQL, because the invariants that matter most
 * — one write path, no clamping, an immutable ledger — are properties of statements rather than of
 * a function's return value, and a behavioural test needs a live database that CI's unit job does
 * not have. The second exercises the pure validation logic directly.
 *
 * Every assertion names a defect the reviews found in the previous model. If one of these fails,
 * the failure is not "a test broke" — it is that the stock figures can lie again.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/* Imported from `../reasons` rather than `../ledger`: the latter pulls in the database
 * connection, and these are assertions about a vocabulary, not about a query. */
import { MANUAL_REASONS, requireManualReason } from '../reasons';
import { AdminApiError } from '@/lib/api/AdminApiError';

/**
 * Read a file from the repository as text.
 *
 * @param relativePath - Path from the repository root.
 * @returns The file's contents.
 */
function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('the inventory ledger migration', () => {
  const ledger = source('database/migrations/027_inventory_ledger.sql');
  const writer = source('database/migrations/029_single_stock_writer.sql');
  const invariants = source('database/migrations/030_stock_invariants.sql');
  const cascade = source('database/migrations/031_ledger_cascade.sql');

  it('writes balance_after from the value the atomic update returned', () => {
    /*
     * This is what makes the ledger replay to the balance. The old code took a `quantity_after`
     * supplied by the browser alongside an unrelated `quantity_change`, so a caller could set stock
     * to 500 and record a movement of +1 and nothing would ever notice.
     */
    expect(ledger).toContain('RETURNING on_hand INTO v_balance');
    expect(ledger).toMatch(/balance_after[\s\S]*v_balance/);
  });

  it('updates the balance in one statement rather than read-then-write', () => {
    // Two concurrent sales of the last unit both read 1 and both wrote 0 under the old function.
    expect(ledger).toContain('ON CONFLICT (store_id, product_id, location_id) DO UPDATE');
    expect(ledger).toContain('on_hand = public.inventory_levels.on_hand + EXCLUDED.on_hand');
  });

  it('never clamps a negative balance to zero', () => {
    /*
     * The old trigger did `IF new_stock < 0 THEN new_stock := 0`, then logged the *unclamped*
     * delta against the *clamped* balance — so the log stopped reconciling, and every oversell was
     * erased rather than surfaced.
     */
    expect(ledger).not.toMatch(/new_stock\s*:=\s*0/);
    expect(writer).not.toMatch(/IF\s+new_stock\s*<\s*0/);
  });

  it('refuses a movement of zero units', () => {
    // `quantity_change: 0` rows were written to assert a balance that did not exist.
    expect(ledger).toContain('inventory_transactions_delta_not_zero');
  });

  it('makes available a generated column so it cannot drift from its definition', () => {
    expect(ledger).toContain('available INTEGER GENERATED ALWAYS AS');
    expect(ledger).toContain('on_hand - committed - reserved - unavailable');
  });

  it('refuses updates to posted movements', () => {
    expect(cascade).toContain("TG_OP = 'UPDATE'");
    expect(cascade).toContain('append-only');
  });

  it('lets a movement cascade away with the product it describes', () => {
    // Otherwise tenant erasure and the demo seed's reset both fail on the immutability trigger.
    expect(cascade).toContain('NOT EXISTS (SELECT 1 FROM public.products WHERE id = OLD.product_id)');
  });

  it('resolves the product inside the store, so a movement cannot cross tenants', () => {
    expect(ledger).toContain('WHERE id = p_product_id AND store_id = p_store_id');
  });

  it('posts sales idempotently, keyed on the order line', () => {
    // Webhook replays and retries must not decrement stock twice.
    expect(writer).toContain("reference_type = 'order_item'");
    expect(writer).toMatch(/IF v_already > 0 THEN\s+RETURN NEW;/);
  });

  it('translates a direct write to the projection into a movement', () => {
    /*
     * `products.stock_quantity` is a projection. Any code still writing it directly — the sync, the
     * seed, an import — would otherwise put the projection ahead of the ledger until something else
     * silently corrected it back.
     */
    expect(invariants).toContain('translate_direct_stock_write');
    expect(invariants).toContain('AFTER INSERT OR UPDATE OF stock_quantity ON public.products');
  });

  it('terminates the projection/translation trigger cycle on a zero delta', () => {
    // The projection writes stock_quantity, which fires the translator, which must then do nothing.
    expect(invariants).toMatch(/IF v_delta = 0 THEN\s+RETURN NULL;/);
  });

  it('gives every new store a stock location by trigger, not by backfill', () => {
    // A backfill only holds until the next store is created; the seed failed on exactly that.
    expect(invariants).toContain('AFTER INSERT ON public.stores');
  });
});

describe('requireManualReason', () => {
  it.each(MANUAL_REASONS.map((r) => r.value))('accepts %s', (reason) => {
    expect(requireManualReason(reason)).toBe(reason);
  });

  it.each(['sale', 'transfer_in', 'transfer_out', 'sync_correction'])(
    'refuses %s, which only the system that owns it may post',
    (reason) => {
      /*
       * If the admin could hand-post a `sale`, the reason vocabulary would stop meaning anything
       * for reporting — "where did 60 units go" is only answerable while each reason has one
       * source.
       */
      expect(() => requireManualReason(reason)).toThrow(AdminApiError);
    }
  );

  it.each([undefined, null, '', 'nonsense', 42, {}])('refuses %p', (value) => {
    expect(() => requireManualReason(value)).toThrow('Choose why the stock is changing');
  });

  it('offers a stock count, which is how a merchant states an absolute quantity', () => {
    // The API takes deltas; a count is the one absolute figure it accepts, converted under a lock.
    expect(MANUAL_REASONS.map((r) => r.value)).toContain('cycle_count');
  });
});
