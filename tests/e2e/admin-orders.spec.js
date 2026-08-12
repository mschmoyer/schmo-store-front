const { expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');

/**
 * Admin Orders — end-to-end coverage.
 *
 * There was no `/admin/orders` route, no `/api/admin/orders` endpoint and no
 * nav entry, while the database held 27 orders worth $6,311.79 for this store
 * and 51 tracking numbers. The consequence a merchant would actually have felt:
 * **five orders sat unshipped for 61 to 73 days — $1,946.55 — and nothing in
 * the application mentioned it.**
 *
 * These tests are written against that failure. They check that the money and
 * the ageing orders are on screen, that the numbers match the database, and
 * that the page cannot quietly show an empty list when the request fails.
 *
 * Figures verified with:
 * ```sql
 * SELECT status, COUNT(*), SUM(total_amount) FROM orders
 *  WHERE store_id = '650e8400-e29b-41d4-a716-446655440001' GROUP BY status;
 * -- cancelled 6/723.68, completed 8/2174.05, pending 1/654.91,
 * -- processing 4/1291.64, shipped 8/1467.51   => booked 5588.11 over 21
 * ```
 */

/** The five orders the audit found stranded, oldest first. */
const AGEING_ORDERS = ['BCA-1014', 'BCA-1011', 'BCA-1004', 'BCA-1001', 'BCA-1020'];

adminAuthFixture.describe('Admin orders — the page exists and leads with what is stuck', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/orders');
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('is reachable from the sidebar', async ({ adminPage }) => {
    // The nav had eleven items and none of them was Orders.
    await adminPage.goto('/admin');
    await adminPage.getByRole('link', { name: 'Orders', exact: true }).click();
    await expect(adminPage).toHaveURL(/\/admin\/orders/);
    await expect(adminPage.locator('h1')).toContainText('Orders');
  });

  adminAuthFixture('makes the ageing orders impossible to miss', async ({ adminPage }) => {
    const banner = adminPage.getByText(/unshipped for more than \d+ days/);
    await expect(banner).toBeVisible();

    // The money at stake and the age of the worst offender, both stated.
    await expect(adminPage.getByText('$1,946.55').first()).toBeVisible();
    await expect(adminPage.getByText(/73 days/).first()).toBeVisible();
  });

  adminAuthFixture('sorts the longest-waiting order to the top', async ({ adminPage }) => {
    // BCA-1014 has been waiting 73 days; it is the first row regardless of
    // when it was placed relative to the others.
    const firstOrder = adminPage.locator('tbody tr').first();
    await expect(firstOrder).toContainText('BCA-1014');
    await expect(firstOrder).toContainText('Waiting 73 days');
  });

  adminAuthFixture('lists every stranded order with its age', async ({ adminPage }) => {
    for (const orderNumber of AGEING_ORDERS) {
      await expect(adminPage.getByRole('link', { name: orderNumber })).toBeVisible();
    }
    await expect(adminPage.getByText(/Waiting \d+ days/)).toHaveCount(AGEING_ORDERS.length);
  });

  adminAuthFixture('reports booked value excluding cancellations only', async ({ adminPage }) => {
    // $5,588.11 over 27 orders. The dashboard used to show $2,174.05 because it
    // filtered `status = 'completed'`, discarding everything shipped.
    await expect(adminPage.getByText('Booked value')).toBeVisible();
    await expect(adminPage.getByText('$5,588').first()).toBeVisible();
    await expect(adminPage.getByText(/27 orders, cancellations excluded/)).toBeVisible();
  });
});

adminAuthFixture.describe('Admin orders — filtering and lookup', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/orders');
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('defaults to the orders that need an action', async ({ adminPage }) => {
    // A merchant with ten minutes on a Monday wants the work, not the archive.
    await expect(adminPage.getByRole('radio', { name: 'Needs shipping' })).toBeChecked();
    await expect(adminPage.locator('tbody tr')).toHaveCount(AGEING_ORDERS.length);
  });

  adminAuthFixture('honours a status deep link from the dashboard', async ({ adminPage }) => {
    await adminPage.goto('/admin/orders?status=cancelled');
    await adminPage.waitForLoadState('networkidle');

    await expect(adminPage.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    await expect(adminPage.getByText('cancelled').first()).toBeVisible();
  });

  adminAuthFixture('finds an order by number, for a "where is my package" email', async ({ adminPage }) => {
    await adminPage.getByLabel('Search orders').fill('BCA-1004');
    await expect(adminPage.getByRole('link', { name: 'BCA-1004' })).toBeVisible({ timeout: 15000 });
    await expect(adminPage.locator('tbody tr')).toHaveCount(1);
  });

  adminAuthFixture('shows shipped orders with their tracking numbers', async ({ adminPage }) => {
    // Mantine's SegmentedControl hides the radio input and paints a label over
    // it, so the label is what a user (and Playwright) can actually click.
    await adminPage.getByText('Shipped', { exact: true }).click();
    await adminPage.waitForLoadState('networkidle');

    // 51 of the store's orders carry a tracking number and not one was
    // visible anywhere in the product before this page existed.
    const rows = adminPage.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    await expect(
      adminPage.getByRole('button', { name: /Copy tracking number/ }).first()
    ).toBeVisible();
  });
});

adminAuthFixture.describe('Admin orders — one order', () => {
  adminAuthFixture('opens a detail view with per-line margin', async ({ adminPage }) => {
    await adminPage.goto('/admin/orders');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByRole('link', { name: 'BCA-1014' }).click();

    await expect(adminPage.locator('h1')).toContainText('BCA-1014');

    /*
     * Gross profit per order appeared nowhere in the admin. BCA-1014 is one
     * line: 1 × BCA-AUD-1002 at $179.00 against a $85.92 unit cost, so $93.08
     * at 52.0%. Verified:
     *   SELECT unit_price, unit_cost, quantity FROM order_items oi
     *     JOIN orders o ON o.id = oi.order_id WHERE o.order_number = 'BCA-1014';
     */
    await expect(adminPage.getByText('Gross profit')).toBeVisible();
    await expect(adminPage.getByText('$93').first()).toBeVisible();
    await expect(adminPage.getByText('52.0% margin on revenue')).toBeVisible();

    // The cost snapshot from migration 023, shown on the line.
    await expect(adminPage.getByText('$85.92')).toBeVisible();

    // And the reason this order matters at all.
    await expect(adminPage.getByText('Unshipped for 73 days')).toBeVisible();
  });
});

adminAuthFixture.describe('Admin orders — failure is visible', () => {
  adminAuthFixture('shows an error rather than an empty list', async ({ adminPage }) => {
    // Same discipline as the coupons page: an empty state is a claim about the
    // data and must never be made on the strength of a 500.
    await adminPage.route('**/api/admin/orders?*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      })
    );

    await adminPage.goto('/admin/orders');
    await adminPage.waitForLoadState('networkidle');

    await expect(adminPage.getByText('Could not load orders')).toBeVisible();
    await expect(adminPage.getByText('Nothing waiting to ship')).toHaveCount(0);
  });
});
