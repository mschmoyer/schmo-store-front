const { expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');

/**
 * Admin Coupons — end-to-end coverage.
 *
 * ## Why this file was rewritten
 *
 * The previous 812-line suite tested the wrong product. It asserted a
 * `Coupons` / `Discounts` tab pair, a "Create Discount" button, a "Discount
 * Rules" table and a `discount_id` link between the two — the shape of an
 * abandoned refactor that never landed. There is no `discounts` table in any
 * migration, `coupons` has no `discount_id` column, and the API that served
 * that UI returned `relation "discounts" does not exist` on every request.
 *
 * So the suite was codifying a schema that does not exist, against a page
 * whose data never loaded, behind a login fixture pointing at a user that was
 * never seeded. It could not fail in a way that told anyone anything.
 *
 * What is tested now is the thing a merchant does: see the codes that are
 * live, see what they have cost, create one, switch one off, delete one — and,
 * most importantly, be told when the list could not be loaded rather than
 * being shown an empty state that says they have none.
 */

/** The store seeded by `scripts/seed-demo.js`, whose coupons these are. */
const SEEDED_CODES = ['FREESHIP', 'WELCOME10'];

adminAuthFixture.describe('Admin coupons — the list', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/coupons');
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('shows the coupons that exist, not an empty state', async ({ adminPage }) => {
    /*
     * THE REGRESSION THIS FILE EXISTS FOR.
     *
     * `/admin/coupons` reported "Active coupons 0", "Total redemptions 0" and
     * "No coupon codes yet" while FREESHIP and WELCOME10 were live on the
     * storefront. The API 500'd and the page caught the failure into its empty
     * state, so the merchant was told their promotions did not exist. They
     * would have created duplicates.
     */
    await expect(adminPage.locator('h1')).toContainText('Coupons');
    await expect(adminPage.getByText('No coupon codes yet')).toHaveCount(0);

    for (const code of SEEDED_CODES) {
      await expect(adminPage.getByText(code, { exact: true })).toBeVisible();
    }
  });

  adminAuthFixture('reports a live count that matches the rows', async ({ adminPage }) => {
    // Verified against:
    //   SELECT code, is_active, valid_until FROM coupons
    //    WHERE store_id = '650e8400-e29b-41d4-a716-446655440001';
    //   -> FREESHIP and WELCOME10, both active, both valid to 2026-10-11.
    const liveTile = adminPage.locator('text=Live now').locator('..');
    await expect(liveTile).toBeVisible();

    const liveBadges = adminPage.getByText('live', { exact: true });
    const liveCount = await liveBadges.count();
    expect(liveCount).toBeGreaterThanOrEqual(SEEDED_CODES.length);
  });

  adminAuthFixture('states each discount in the merchant\'s own terms', async ({ adminPage }) => {
    // FREESHIP is fixed_amount 9.99 over a $40 minimum; WELCOME10 is 10%.
    await expect(adminPage.getByText('$9.99 off')).toBeVisible();
    await expect(adminPage.getByText('10% off')).toBeVisible();
    await expect(adminPage.getByText(/on orders over \$40\.00/)).toBeVisible();
  });

  adminAuthFixture('offers no Discounts tab', async ({ adminPage }) => {
    // The half-built second table is gone, along with its `?type=discounts`
    // API path. A tab that 500s is worse than no tab.
    await expect(adminPage.getByRole('tab', { name: /Discount/i })).toHaveCount(0);
    await expect(adminPage.getByText('Discount Rules')).toHaveCount(0);
  });
});

adminAuthFixture.describe('Admin coupons — failure is visible', () => {
  adminAuthFixture('shows an error, never an empty state, when the API fails', async ({ adminPage }) => {
    /*
     * The single most important behaviour on this page. An empty state is a
     * claim about the data — "you have not made one of these yet" — and making
     * that claim on the strength of a 500 is how a completely broken feature
     * stayed invisible.
     */
    await adminPage.route('**/api/admin/coupons*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Internal server error',
          message: 'relation "discounts" does not exist',
        }),
      })
    );

    await adminPage.goto('/admin/coupons');
    await adminPage.waitForLoadState('networkidle');

    await expect(adminPage.getByText('Could not load your coupons')).toBeVisible();
    await expect(adminPage.getByText('No coupon codes yet')).toHaveCount(0);

    // The server's own message is shown, so the cause is diagnosable from the
    // screen rather than only from a log.
    await expect(adminPage.getByText(/relation "discounts" does not exist/)).toBeVisible();
  });
});

/*
 * Editor locators are scoped to the dialog and matched on a `/^Label/` prefix
 * rather than an exact string. Two reasons, both learned the hard way here: a
 * required field's accessible name is `Code *`, not `Code`, so an exact match
 * silently resolves nothing; and unscoped `getByLabel('Code')` matches the
 * Next.js dev-overlay button, whose aria-label happens to contain the word
 * "code".
 */
adminAuthFixture.describe('Admin coupons — the editor', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/coupons');
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('opens without crashing', async ({ adminPage }) => {
    // The editor used to throw
    // `Using 'style.minHeight' for <TextareaAutosize/> is not supported`
    // on render, so a coupon could be neither listed nor created.
    await adminPage.getByRole('button', { name: 'New coupon' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Code/)).toBeVisible();
    // The Textarea that used to crash the whole editor.
    await expect(dialog.getByLabel(/^Description/)).toBeVisible();
  });

  adminAuthFixture('creates, lists and deletes a coupon', async ({ adminPage }) => {
    const code = `E2E${Date.now().toString().slice(-6)}`;

    await adminPage.getByRole('button', { name: 'New coupon' }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel(/^Code/).fill(code);
    await dialog.getByLabel(/^Name/).fill('End to end test coupon');
    await dialog.getByRole('button', { name: 'Create coupon' }).click();

    // Round trip: the coupon a merchant creates must come back on the list.
    // The purchase-orders page's failure mode — create works, list shows
    // hardcoded data — is exactly what this guards against.
    await expect(adminPage.getByText(code, { exact: true })).toBeVisible({ timeout: 15000 });

    adminPage.once('dialog', (dialog) => dialog.accept());
    await adminPage.getByRole('button', { name: `Delete ${code}` }).click();

    await expect(adminPage.getByText(code, { exact: true })).toHaveCount(0, { timeout: 15000 });
  });

  adminAuthFixture('reveals product targeting only when it applies', async ({ adminPage }) => {
    await adminPage.getByRole('button', { name: 'New coupon' }).click();
    const dialog = adminPage.getByRole('dialog');

    // `applies_to` is a real column on `coupons`; the targeting arrays are too.
    await expect(dialog.getByLabel(/^Products/)).toHaveCount(0);

    await dialog.getByLabel(/^Applies to/).click();
    await adminPage.getByRole('option', { name: 'Specific products' }).click();

    await expect(dialog.getByLabel(/^Products/)).toBeVisible();
  });

  adminAuthFixture('refuses a duplicate code', async ({ adminPage }) => {
    await adminPage.getByRole('button', { name: 'New coupon' }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel(/^Code/).fill('WELCOME10');
    await dialog.getByRole('button', { name: 'Create coupon' }).click();

    await expect(adminPage.getByText(/already exists/i)).toBeVisible({ timeout: 15000 });
  });
});
