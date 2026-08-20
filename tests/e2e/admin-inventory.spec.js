/**
 * The admin inventory page, end to end.
 *
 * Rewritten with the page. The previous suite covered five tabs that no longer live here —
 * purchase orders, suppliers, reports and alerts each have their own screen now — and asserted
 * that their modals opened. It passed while "Create purchase order" made no request at all and
 * while the receive endpoint was a `console.log` that returned `success: true`.
 *
 * What is tested here is what a merchant does on this page: see what needs ordering, adjust stock
 * with a reason, count a shelf, and read where the units went. Each test asserts a change that
 * survives a reload, because the failure mode this page has actually had is a green toast over a
 * write that never happened.
 */

const { test, expect } = require('@playwright/test');
const { AdminLoginPage } = require('../pages/admin/login-page');

/** Open the inventory page and wait for real content. */
async function gotoInventory(page) {
  await page.goto('/admin/inventory');
  await page.waitForLoadState('networkidle');
  await Promise.race([
    page.waitForSelector('table tbody tr', { timeout: 20000 }),
    page.waitForSelector('text=No stock tracked yet', { timeout: 20000 })
  ]);
}

/** Read a view tab's badge count. */
async function viewCount(page, label) {
  const text = await page.locator('[role=tab]').filter({ hasText: label }).first().textContent();
  const match = /(\d+)$/.exec(text ?? '');
  return match ? Number(match[1]) : null;
}

/** Read one row's numeric cell by column position. */
async function cellValue(page, rowIndex, columnIndex) {
  const text = await page
    .locator('table tbody tr')
    .nth(rowIndex)
    .locator('td')
    .nth(columnIndex)
    .textContent();
  return Number((text ?? '').replace(/[^0-9-]/g, ''));
}

test.describe('Admin inventory', () => {
  test.beforeEach(async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto();
    await login.login('demo@schmostore.com', 'rebeldev');
    await login.waitForLoginSuccess();
    await gotoInventory(page);
  });

  test('shows the quantities apart from one another', async ({ page }) => {
    /*
     * The old page showed one number, `stock_quantity`, which the sync overwrote with *available*
     * while the order trigger subtracted from it as *on hand*. These five columns are the whole
     * point of the ledger underneath.
     */
    for (const heading of ['On hand', 'Committed', 'Available', 'On order', 'Cover']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${heading}`) }).first()).toBeVisible();
    }
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
  });

  test('every view badge matches the rows it opens', async ({ page }) => {
    for (const label of ['Needs reordering', 'Low', 'Out', 'Oversold', 'Not selling']) {
      await page.locator('[role=tab]').filter({ hasText: label }).first().click();
      await page.waitForTimeout(700);

      /* Read the pair together until it settles — see the note in the catalogue spec. */
      await expect
        .poll(
          async () => {
            const badge = await viewCount(page, label);
            const empty = await page.getByText('Nothing matches that').count();
            const rows = empty ? 0 : await page.locator('table tbody tr').count();
            return badge === rows ? 'match' : `badge ${badge} vs ${rows} rows`;
          },
          { message: `the "${label}" badge should match the rows it opens`, timeout: 8000 }
        )
        .toBe('match');
    }
  });

  test('a stock adjustment requires a reason and moves the stock', async ({ page }) => {
    const onHandBefore = await cellValue(page, 0, 1);

    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    await expect(page.getByText('Something moved')).toBeVisible();

    /* The reason is a required field with a closed vocabulary, not a free-text note. */
    await expect(page.getByRole('textbox', { name: 'Why' })).toBeVisible();

    await page.getByRole('textbox', { name: 'How many units' }).fill('2');

    /* The consequence is stated in words before it happens, not encoded in a colour. */
    await expect(page.getByText(/On hand becomes/)).toBeVisible();

    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');

    /* "Damaged" is the default reason and removes stock, so on hand must have fallen by two. */
    expect(await cellValue(page, 0, 1)).toBe(onHandBefore - 2);

    /* Put it back through the same path, which is also how a merchant corrects a mis-keyed
     * adjustment — the ledger has no edit. */
    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    await page.getByRole('textbox', { name: 'Why' }).click();
    await page.getByRole('option', { name: 'Customer return' }).click();
    await page.getByRole('textbox', { name: 'How many units' }).fill('2');
    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await page.waitForTimeout(2000);
  });

  test('the movement history reads back', async ({ page }) => {
    /*
     * This data has been accumulating since the platform was built and nothing has ever displayed
     * it — a merchant investigating a discrepancy had no way to ask what happened.
     */
    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Stock history' }).click();

    await expect(page.getByText('Where the units went')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Every movement')).toBeVisible();

    /* The ledger is append-only, and the drawer says so rather than offering an edit that would
     * quietly rewrite history. */
    await expect(page.getByText(/cannot be edited or deleted/)).toBeVisible();
  });

  test('a reorder point set in the grid is saved', async ({ page }) => {
    const cell = page.getByRole('button', { name: /^Reorder point for .*Select to edit/ }).first();
    await cell.click();

    const input = page.locator('input[aria-label^="Reorder point for"]');
    await input.fill('9');
    await input.press('Enter');
    await page.waitForTimeout(1500);

    /*
     * The old modal collected a reorder point and the API dropped it on the floor beneath a
     * "Successfully updated" toast, so the reload is the assertion that matters.
     */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');

    const after = await page
      .getByRole('button', { name: /^Reorder point for .*Select to edit/ })
      .first()
      .textContent();
    expect(after).toContain('9');
  });

  test('export returns a CSV of the current view', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: /Export this view/ }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('links out to the surfaces that used to be tabs here', async ({ page }) => {
    /*
     * Purchase orders and suppliers were tabs on this page, which meant two implementations of the
     * same list — the tab's had a dead edit button, no pagination, and sent no store id, so it was
     * permanently empty.
     */
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Suppliers' }).click();
    await page.waitForURL(/\/admin\/suppliers/);
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();

    await gotoInventory(page);
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Purchase orders' }).click();
    await page.waitForURL(/\/admin\/purchase-orders/);
  });

  test('reports an error rather than an empty table', async ({ page }) => {
    /*
     * A failed fetch used to be swallowed, leaving a fully-rendered page with zeroed cards and no
     * rows — which a merchant reads as "I have no inventory", not "something went wrong".
     */
    await page.route('**/api/admin/inventory?*', (route) => route.abort());
    await page.reload();

    await expect(page.getByText('Could not load inventory')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('row actions are named for assistive technology', async ({ page }) => {
    const menu = page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ });
    await expect(menu).toBeVisible();

    /* Stock state is a dot plus a word, so it is not conveyed by colour alone. */
    const stateText = await page.locator('table tbody tr').first().textContent();
    expect(stateText).toMatch(/In stock|Low|Out|Oversold|Untracked/);
  });
});
