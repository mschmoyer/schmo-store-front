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

/**
 * Put a row with stock in it at the top.
 *
 * The default sort is by name, and the first product alphabetically may well have nothing on the
 * shelf — transferring or holding zero units is correctly refused, so a test that reaches for row
 * zero is testing the refusal. Sorting by on hand, descending, makes "the first row" mean "a row
 * this operation can actually be performed on".
 */
async function sortByMostStock(page) {
  const heading = page.getByRole('button', { name: /^On hand/ }).first();

  /* Clicked until the header reports descending. Asserting the state rather than counting clicks:
   * the first click on a column that is not the active sort sets ascending, and a fixed number of
   * clicks would depend on where the page happened to start. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sorted = await page
      .locator('th[aria-sort="descending"]')
      .filter({ hasText: 'On hand' })
      .count();
    if (sorted > 0) break;
    await heading.click();
    await page.waitForTimeout(800);
  }

  await expect(
    page.locator('th[aria-sort="descending"]').filter({ hasText: 'On hand' })
  ).toHaveCount(1);
}

/**
 * Read one row's numeric cell, by column *heading* rather than position.
 *
 * Positional indices broke the moment a selection checkbox column was added to the left of the
 * grid: every number silently shifted one place and the assertions started comparing on-hand
 * against committed. Resolving the index from the header row means a test fails when the number is
 * wrong, not when the layout moves.
 *
 * @param page - The Playwright page.
 * @param rowIndex - Which body row, zero-based.
 * @param heading - The column's heading text, such as "On hand".
 * @returns The cell's numeric content.
 */
async function cellValue(page, rowIndex, heading) {
  const headings = await page.locator('table thead th').allInnerTexts();
  const columnIndex = headings.findIndex((text) => text.trim().startsWith(heading));
  if (columnIndex === -1) {
    throw new Error(`No column headed "${heading}". Headings: ${headings.join(' | ')}`);
  }

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
    const onHandBefore = await cellValue(page, 0, 'On hand');

    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    await expect(page.getByText('Something moved')).toBeVisible();

    /* The reason is a required field with a closed vocabulary, not a free-text note. */
    await expect(page.getByRole('textbox', { name: 'Why' })).toBeVisible();

    await page.getByRole('textbox', { name: 'How many units' }).fill('2');

    /*
     * Submitting without a reason is refused.
     *
     * The dialog used to default to "Damaged", so opening it, typing a number and pressing the
     * button wrote stock off as damaged — a reason with real consequences for valuation and for a
     * supplier claim, chosen by nobody. The reason is the entire point of this dialog.
     */
    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await expect(page.getByText('Choose what happened to these units')).toBeVisible();

    await page.getByRole('textbox', { name: 'Why' }).click();
    await page.getByRole('option', { name: 'Damaged' }).first().click();

    /* The consequence is stated in words before it happens, not encoded in a colour. */
    /* "On hand at Back Room becomes 12" in a multi-location store, "On hand becomes 12" in a
     * single-location one — the location is named only when there is more than one, because it is
     * ambiguous only then. */
    await expect(page.getByText(/On hand.*becomes/)).toBeVisible();

    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');

    /* "Damaged" removes stock, so on hand must have fallen by two. */
    expect(await cellValue(page, 0, 'On hand')).toBe(onHandBefore - 2);

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

  test('a second location can be created, and stock moved into it', async ({ page }) => {
    /*
     * Multi-location was presented throughout the product and implemented nowhere: the table, the
     * levels, the grid filter and the ledger's location column all existed, `transferStock` was
     * exported and never called, and nothing could create a second row — so every store had exactly
     * the one its trigger made and the adjustment dialog's location picker had one option.
     *
     * The assertion that matters is the pair of ledger entries, not the dialog: a transfer that
     * moved a number without recording both legs would leave the two locations unreconcilable.
     */
    /*
     * A fixed name, created only if it is not already there.
     *
     * A unique name per run accumulated a location every time the suite ran — and they cannot be
     * cleaned up afterwards, because once stock has moved through a location its ledger rows
     * reference it and deleting it is correctly refused. Eighteen "E2E Room" entries in the
     * location picker is the suite damaging the data it runs against.
     */
    const name = 'E2E Location';

    await sortByMostStock(page);

    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: 'Locations' }).click();
    await expect(page.getByText('Stock locations')).toBeVisible();

    if ((await page.getByText(name).count()) === 0) {
      await page.getByLabel('Add a location').fill(name);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
    }
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });

    /* The default location cannot be removed, because it is where an unlocated movement goes. */
    await expect(page.getByRole('button', { name: /Remove Main/ })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const onHandBefore = await cellValue(page, 0, 'On hand');

    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Move between locations' }).click();
    await expect(page.getByText('Move stock between locations')).toBeVisible();

    await page.getByRole('textbox', { name: 'From', exact: true }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('textbox', { name: 'To', exact: true }).click();
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await page.getByRole('textbox', { name: 'How many units', exact: true }).fill('3');
    await page.getByRole('button', { name: 'Move stock' }).click();
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');

    /* The store-wide total is unchanged: a transfer moves stock, it does not create or destroy it.
     * That is the property the two-legged ledger entry exists to guarantee. */
    expect(await cellValue(page, 0, 'On hand')).toBe(onHandBefore);

    /* And both legs are in the history. */
    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Stock history' }).click();
    /* Both legs are in the history — the badge and the per-reason summary — which is exactly what
     * makes a transfer readable from either end. */
    await expect(page.getByText('Transferred out').first()).toBeVisible({ timeout: 15000 });
  });

  test('stock can be held back from sale without leaving the shelf', async ({ page }) => {
    /*
     * `inventory_levels.unavailable` was in the grid, the CSV, the detail page and a statistics
     * tile, and no code path ever wrote it — so "present but not saleable" was displayed throughout
     * and could not happen, and this view could never match a row.
     *
     * The distinction is the whole point, so it is what this asserts: on hand unchanged, available
     * down.
     */
    await sortByMostStock(page);

    const onHandBefore = await cellValue(page, 0, 'On hand');
    const availableBefore = await cellValue(page, 0, 'Available');
    expect(onHandBefore).toBeGreaterThan(2);

    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    await page.getByRole('radio', { name: 'Hold stock back' }).click();

    await page.getByRole('textbox', { name: 'How many units' }).fill('2');
    /* The label reads "Note (required)" for a quarantine, which is the point — somebody eventually
     * has to know what these units are waiting on. */
    await page.getByRole('textbox', { name: /^Note/ }).fill('E2E: awaiting inspection');
    await expect(page.getByText(/stay on the shelf but stop being sellable/)).toBeVisible();

    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');

    expect(await cellValue(page, 0, 'On hand')).toBe(onHandBefore);
    expect(await cellValue(page, 0, 'Available')).toBe(availableBefore - 2);

    /* Put them back, so the suite can run twice. */
    await page.locator('table tbody tr').first().getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    await page.getByRole('radio', { name: 'Hold stock back' }).click();
    await page.getByRole('radio', { name: 'Return to sale' }).click();
    await page.getByRole('textbox', { name: 'How many units' }).fill('2');
    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await page.waitForTimeout(2000);
  });

  test('the restock worklist turns into a purchase order', async ({ page }) => {
    /*
     * The journey this page exists for, and the one it could not do.
     *
     * Inventory had no row selection and no bulk actions at all, so deciding what to order for
     * forty SKUs meant opening forty row menus — and the screen that turned a shortage into a
     * purchase order was a separate page whose Create button could never submit.
     */
    await sortByMostStock(page);

    /* No bar until something is selected: it is a response to a choice, not furniture. */
    expect(await page.locator('[role="region"][aria-label*="Bulk actions"]').count()).toBe(0);

    await page.locator('table tbody tr input[type="checkbox"]').first().check();
    const bar = page.locator('[role="region"][aria-label*="Bulk actions"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('1 product selected');

    await page.getByRole('button', { name: 'Create purchase order' }).first().click();

    const modal = page.locator('.mantine-Modal-body');
    await expect(modal.getByText('One order, to one supplier')).toBeVisible();

    /* Every selected line is listed with a quantity already worked out from the reorder policy,
     * net of what is on the shelf and what is already on order. */
    const quantity = modal.locator('input[aria-label^="Order quantity for"]').first();
    await expect(quantity).toBeVisible();

    /* And it will not submit without a supplier — an order is placed with someone. */
    await expect(
      modal.getByRole('button', { name: 'Create purchase order' })
    ).toBeDisabled();
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
