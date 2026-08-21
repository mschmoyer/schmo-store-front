/**
 * Regression guard for `setFulfillmentSyncStatus`'s SQL.
 *
 * That UPDATE uses `$2` twice — once assigned to the `fulfillment_sync_status`
 * varchar column, once compared to the text literal `'pushed'`. Postgres infers
 * a placeholder's type from its uses, and those two uses disagree, so the
 * un-cast form threw `42P08 inconsistent types deduced for parameter $2` on
 * every call. All six push call sites route through this function, so no order
 * ever left `pending` and the merchant-visible sync-failure signal never fired.
 *
 * The unit suite mocks the database, and `orderPush` pulls the real `pg` pool in
 * transitively through the job queue, so neither a mock nor an import can
 * reproduce a parameter-type error here — which is how the defect survived a
 * green suite. This test guards the SQL text statically: every `$2` must carry
 * a `::text` cast. The live-Postgres proof is the e2e checkout, which runs an
 * order through `enqueueOrderPush` against a real database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('setFulfillmentSyncStatus SQL', () => {
  const source = readFileSync(join(__dirname, '..', 'orderPush.ts'), 'utf8');

  it('casts every $2 in the UPDATE to text', () => {
    const update = source.slice(source.indexOf('UPDATE orders'), source.indexOf('WHERE id = $1'));
    expect(update).toContain('fulfillment_sync_status = $2::text');
    expect(update).toContain("CASE WHEN $2::text = 'pushed'");
    // A bare `$2` not followed by `::text` is the regression.
    expect(/\$2(?!::text)/.test(update)).toBe(false);
  });
});
