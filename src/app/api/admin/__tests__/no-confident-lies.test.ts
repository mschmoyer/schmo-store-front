/**
 * Regression guards for the specific wrong numbers the admin used to display.
 *
 * These read the shipped source rather than calling the routes, because every
 * failure being guarded against was a *textual* fault — a join in the wrong
 * clause, a literal where a query belonged, a table name that no migration
 * creates, a mock array left in a list page. A behavioural test needs a live
 * database and would not have caught any of them at review time; a grep for
 * the exact defect would have caught all of them.
 *
 * A number displayed to a merchant must come from the database. Each block
 * below names the figure, what it used to say, and what the truth was.
 */

/**
 * PENDING — these are acceptance criteria, not passing guards.
 *
 * Every assertion below describes a defect the admin usefulness audit verified
 * against the database and that is STILL PRESENT in the shipped source. They
 * were written before the fixes, deliberately, so the fix has a definition of
 * done. They are skipped only so a paused branch does not sit red; the work is
 * tracked in docs/decision-log.md and docs/audits/admin-usefulness-critique.md.
 *
 * Un-skip each block as its fix lands. Do not delete a block to make the suite
 * green — the defects are real:
 *
 *   dashboard          revenue filtered to status = 'completed' rather than
 *                      <> 'cancelled', so most revenue is invisible
 *   inventory stats    LEFT JOIN inventory_logs fans out and inflates the tile
 *                      249% (45 products reported where there are 12)
 *   valuation          "margin" divides by cost, so it is markup: 97.3%
 *                      displayed where the truth is 49.3%
 *   turnover           hardcoded `0 as total_sales_quantity`, declaring every
 *                      product dead
 *   dead-stock         commented out of the router; component and API both work
 *   reorder            hardcoded low-stock threshold
 *   analytics          bounce rate and session duration are literal constants
 *                      that the same page's narrative contradicts
 *   coupons            queries a `discounts` table no migration creates, and
 *                      the UI swallows the 500 as an empty state
 *   purchase orders    list renders three fake orders from January 2024 and
 *                      never calls its own working API
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');

/**
 * Reads a file from the repository root **with its comments stripped**.
 *
 * Stripping matters: every fix in this pass documents the defect it removed,
 * so the offending strings — `status = 'completed'`, `Math.random()`,
 * `FROM discounts` — still appear in prose beside the corrected code. Matching
 * against raw source would fail on the explanation rather than the behaviour.
 * These assertions are about what the code *does*.
 *
 * @param relativePath - Path relative to the repo root.
 * @returns The file's contents with block and line comments removed.
 */
function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\}/g, '');
}

describe('dashboard', () => {
  const route = source('src/app/api/admin/dashboard/route.ts');

  it('does not filter revenue to completed orders', () => {
    // Showed $2,174.05 of a real $5,588.11, and "$0.00 this month" while a
    // shipped, paid order sat in the current month.
    expect(route).not.toMatch(/status\s*=\s*'completed'/);
  });

  it('does not put the order status test in a LEFT JOIN ON clause', () => {
    // `LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'`
    // filters nothing, so cancelled orders counted as sales: Voltpack Power
    // Bank read 5 sold against 1 truly booked.
    expect(route).not.toMatch(/LEFT JOIN orders[\s\S]{0,80}AND o\.status/);
    expect(route).toContain("o.status <> 'cancelled'");
  });

  it('does not hardcode a low-stock threshold', () => {
    // `stock_quantity <= 5` ignored the per-product `low_stock_threshold`
    // column, so the tile disagreed with the merchant's own configuration.
    expect(route).not.toMatch(/stock_quantity\s*<=\s*5\b/);
    expect(route).toContain('p.stock_quantity <= p.low_stock_threshold');
  });

  it('reports the windowed visitor count under a windowed label', () => {
    // The tile said "This month" and rendered the all-time figure: 164
    // against a true 22.
    expect(route).toContain('window_unique_visitors');
    expect(route).toContain('siteVisitorsAllTime');
  });

  it('computes gross profit', () => {
    expect(route).toContain('GROSS_PROFIT_QUERY');
  });
});

describe('inventory statistics', () => {
  const route = source('src/app/api/admin/inventory/route.ts');

  it('does not aggregate products across a join to inventory_logs', () => {
    /*
     * The fan-out multiplied every tile by a product's log-row count:
     *   products 45 (true 12), value $77,755.47 (true $22,275.99),
     *   low stock 4 (true 2), out of stock 4 (true 1).
     */
    expect(route).not.toMatch(/FROM products p\s*\n\s*LEFT JOIN inventory_logs/);
  });

  it('keys sales velocity off the order date, not the line insert timestamp', () => {
    // All 119 order_items rows carry one insert timestamp, so every velocity
    // window returned the same number for every SKU.
    expect(route).not.toContain('oi.created_at >=');
    expect(route).toContain("o.created_at >= NOW() - INTERVAL '7 days'");
    expect(route).toContain("o.created_at >= NOW() - INTERVAL '90 days'");
  });

  it('counts a shipped order as a sale', () => {
    expect(route).not.toContain("o.status IN ('completed', 'processing')");
    expect(route).toContain("o.status <> 'cancelled'");
  });
});

describe('valuation report', () => {
  const route = source('src/app/api/admin/inventory/reports/valuation/route.ts');

  it('divides margin by retail and reports markup separately', () => {
    // Displayed AVG MARGIN 97.3% against a true 49.3%, with per-row values of
    // 108% and 117% — impossible for a margin, ordinary for a markup.
    expect(route).toContain('average_markup_percentage');
    expect(route).toMatch(/average_margin_percentage:\s*Number\(currentValue\.total_retail_value\)\s*>\s*0/);
  });
});

describe('turnover report', () => {
  const route = source('src/app/api/admin/inventory/reports/turnover/route.ts');

  it('does not return zeroes behind a "no order data available" comment', () => {
    // Declared all 12 products dead at 0.00x with $0 inventory value, for a
    // store holding $22,275.99 that sold $5,358.00 in 90 days.
    expect(route).not.toContain('No order data available');
    expect(route).not.toContain('0 as total_sales_quantity');
    expect(route).not.toContain('999999 as days_to_sell');
  });

  it('reads real order lines', () => {
    expect(route).toContain('FROM order_items oi');
    expect(route).toContain("o.status <> 'cancelled'");
  });
});

describe('dead-stock report', () => {
  const route = source('src/app/api/admin/inventory/reports/dead-stock/route.ts');
  const router = source('src/app/admin/inventory/reports/[reportType]/page.tsx');

  it('is wired into the report router', () => {
    // Commented out in one line, so "Generate Report" silently bounced the
    // merchant back to the Inventory page. It is the marketing deck's hero.
    expect(router).toContain("'dead-stock': DeadStockAnalysisReport");
    expect(router).not.toContain("// 'dead-stock'");
  });

  it('offers no route with no component behind it', () => {
    // supplier-performance had a title and a button, and neither a component
    // nor an API — the same dead end in a different costume.
    expect(router).not.toContain('supplier-performance');
    expect(source('src/app/admin/inventory/page.tsx')).not.toContain('supplier-performance');
  });

  it('measures age from the last sale, not from the product row', () => {
    // Measured `CURRENT_TIMESTAMP - p.created_at`. Every product in a seeded
    // or freshly imported store is created today, so the >= 90 filter matched
    // nothing and the report was empty forever.
    expect(route).not.toContain('999999 as days_since_last_sale');
    expect(route).toContain('WITH last_sale AS');
    expect(route).toContain('COALESCE(ls.last_sale_date');
  });
});

describe('reorder recommendations', () => {
  const route = source('src/app/api/admin/purchase-orders/recommendations/route.ts');

  it('does not floor every recommendation at 20 units', () => {
    // Every recommendation in the product was exactly 20, including 20 units
    // at $46.28 = $925.60 of a lamp that has never sold a single unit.
    expect(route).not.toContain('Math.max(forecast90Days, 20)');
  });

  it('does not pick a supplier at random', () => {
    expect(route).not.toContain('Math.random()');
    expect(route).toContain('supplierBySku');
  });

  it('derives every velocity figure from one daily rate', () => {
    // `0.1/day, 4/week` appeared on one line: dailyVelocity used the 30-day
    // window and weeklyVelocity the raw 7-day count, 6x apart.
    expect(route).toContain('const weeklyVelocity = dailyVelocity * 7');
    expect(route).toContain('const monthlyVelocity = dailyVelocity * 30');
  });

  it('keys velocity off the order date', () => {
    expect(route).not.toContain('oi.created_at >=');
    expect(route).toContain("o.created_at >= NOW() - INTERVAL '30 days'");
  });
});

describe('analytics', () => {
  const trends = source('src/app/api/admin/analytics/trends/route.ts');
  const summary = source('src/app/api/admin/analytics/executive-summary/route.ts');

  it('does not report a hardcoded bounce rate or session duration', () => {
    // `const bounceRate = 32.1` and `const avgSessionDuration = 272`, with no
    // data source, identical for every store forever.
    expect(trends).not.toMatch(/bounceRate\s*=\s*32\.1/);
    expect(trends).not.toMatch(/avgSessionDuration\s*=\s*272/);
    expect(trends).toContain('unavailable');
  });

  it('does not estimate a bounce rate from a three-branch ladder', () => {
    // `avgPagesPerSession <= 1.5 ? 70 : …` produced the 70.0% that the AI
    // narrative asserted 200px above tiles reading 32.1%.
    expect(summary).not.toContain('avgPagesPerSession <= 1.5 ? 70');
  });

  it('does not multiply visitors by an invented de-duplication constant', () => {
    // `Math.floor(totalVisitors * 0.7)` is why one tile said 37 and the
    // narrative beside it said 54.
    expect(trends).not.toContain('totalVisitors * 0.7');
    expect(trends).toContain('COUNT(DISTINCT ip_address)');
  });

  it('does not synthesise trend data from a sine wave', () => {
    expect(trends).not.toContain('generateSampleData');
    expect(trends).not.toContain('Math.sin');
  });
});

describe('coupons', () => {
  const route = source('src/app/api/admin/coupons/route.ts');
  const detail = source('src/app/api/admin/coupons/[id]/route.ts');
  const page = source('src/app/admin/coupons/page.tsx');

  it('does not query a table no migration creates', () => {
    // GET returned `relation "discounts" does not exist` while 6 coupons sat
    // in the table and 2 were live on the storefront.
    for (const file of [route, detail]) {
      expect(file).not.toMatch(/FROM discounts/);
      expect(file).not.toMatch(/JOIN discounts/);
      expect(file).not.toMatch(/INTO discounts/);
      expect(file).not.toMatch(/UPDATE discounts/);
    }
  });

  it('does not reference a column the coupons table does not have', () => {
    for (const file of [route, detail]) {
      expect(file).not.toContain('c.discount_id');
      expect(file).not.toContain('discount_id =');
    }
  });

  it('reads the discount fields the coupons table carries inline', () => {
    expect(route).toContain('c.discount_type');
    expect(route).toContain('c.discount_value');
    expect(route).toContain('c.minimum_order_amount');
  });

  it('does not render an empty state on a failed request', () => {
    /*
     * The page wrapped its fetch in `if (response.ok) { … }` with no else, so
     * a 500 left the list at `[]` and the merchant was told "No coupon codes
     * yet" — a claim about the data, made on the strength of an error.
     */
    expect(page).toContain('!response.ok || !result?.success');
    expect(page).toContain('Could not load your coupons');
  });
});

describe('purchase orders list', () => {
  const page = source('src/app/admin/purchase-orders/page.tsx');

  it('does not render hardcoded orders', () => {
    // Three fake POs from January 2024 replaced whatever the merchant had
    // actually created, on a page whose create and receive flows both work.
    expect(page).not.toContain('mockPurchaseOrders');
    expect(page).not.toContain('ABC Supply Co.');
    expect(page).not.toContain('XYZ Components');
    expect(page).not.toContain('Global Parts Ltd.');
  });

  it('calls the API that already worked', () => {
    expect(page).toContain('/api/admin/purchase-orders?');
  });
});

describe('the abandoned refactor leaves nothing behind', () => {
  it('has no migrations directory the runner never reads', () => {
    // `src/lib/database/migrations/` looked like migrations and could never
    // run: the runner reads `database/migrations/`.
    expect(() => source('src/lib/database/migrations')).toThrow();
    expect(() => source('src/lib/database/coupons.sql')).toThrow();
  });

  it('snapshots unit cost onto order lines', () => {
    const migration = source('database/migrations/023_order_item_unit_cost.sql');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS unit_cost');
    // The snapshot is a trigger, so no insert path can forget it.
    expect(migration).toContain('BEFORE INSERT ON order_items');
  });
});

describe('the nav', () => {
  const nav = source('src/components/admin/AdminNav.tsx');

  it('has an Orders item', () => {
    expect(nav).toContain("label: 'Orders'");
    expect(nav).toContain("href: '/admin/orders'");
  });

  it('shows ten items to a small merchant, not eleven', () => {
    const enabled = nav.match(/enabled: true/g) ?? [];
    // Dashboard, Orders, Products, Inventory, Analytics, Page Design, Pages,
    // Blog, Integrations, Billing.
    //
    // The critic's target was nine, down from eleven, and this is the one item
    // added back since. It earns its place: a merchant with no way to reach
    // Pages has no way to write an About page or a returns policy, and the
    // whole point of the audit was that a small merchant should be able to
    // *find* what they need — not that fewer things should exist. It sits next
    // to Page Design, which is the same mental category.
    //
    // Ten is the ceiling. The next thing that wants a nav item should take
    // this comment as a reason to justify itself, not as permission.
    expect(enabled.length).toBe(10);
  });

  it('keeps the merged routes reachable rather than deleting them', () => {
    // Purchase Orders lives in Inventory, Coupons in Products; both routes
    // still exist and still work.
    expect(nav).toContain("href: '/admin/purchase-orders'");
    expect(nav).toContain("href: '/admin/coupons'");
    expect(source('src/app/admin/products/page.tsx')).toContain('/admin/coupons');
  });
});
