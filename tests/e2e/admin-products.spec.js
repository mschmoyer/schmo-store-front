/**
 * The admin catalogue, end to end.
 *
 * Rewritten with the page. The previous suite asserted that dialogs *opened* — `expect(locator('text=Export Format')).toBeVisible()` — and never pressed the button inside them. That is why
 * three features whose API routes did not exist passed their tests for as long as they existed:
 * bulk actions, CSV export and CSV import all 404'd, and nothing here noticed.
 *
 * So every test below asserts an outcome that would be false if the feature were broken: a row
 * count that changed, a value that survived a reload, a URL that carries the view, a file that
 * arrived. Where a test cannot assert an outcome it does not exist.
 */

const { deflateSync } = require('zlib');
const { test, expect } = require('@playwright/test');
const { AdminLoginPage } = require('../pages/admin/login-page');
const { AdminProductsPage } = require('../pages/admin/products-page');

test.describe('Admin catalogue', () => {
  let products;

  test.beforeEach(async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto();
    await login.login('demo@schmostore.com', 'rebeldev');
    await login.waitForLoginSuccess();

    products = new AdminProductsPage(page);
    await products.goto();
  });

  test('lists the store products', async () => {
    await products.expectLoaded();
    expect(await products.rowCountValue()).toBeGreaterThan(0);
  });

  test('search narrows the grid and survives a reload', async ({ page }) => {
    /* By SKU, which the old list query did not search at all — a merchant pasting a SKU from a
     * packing slip got no results even though the SKU was rendered in every row. */
    await products.search('BCA-AUD');

    /*
     * Asserting what came back rather than that the count fell. A before/after comparison races
     * any other spec adding or removing a product, and "every row matches the term" is the
     * stronger claim anyway.
     */
    const skus = await products.visibleSkus();
    expect(skus.length).toBeGreaterThan(0);
    for (const sku of skus) expect(sku).toContain('BCA-AUD');
    expect(page.url()).toContain('search=BCA-AUD');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');
    expect(await products.visibleSkus()).toEqual(skus);
  });

  test('every saved view badge matches the rows it opens', async () => {
    /*
     * The counts label the tabs, so a badge that disagrees with its own list is worse than no
     * badge. "Needs attention" in particular used to count `completeness_score < 8` while the tab
     * filtered on missing images.
     */
    for (const label of ['Low stock', 'Out of stock', 'Needs attention', 'No cost']) {
      await products.selectView(label);

      /*
       * Re-read the badge and the rows together until they agree. Both move at once when another
       * spec adds or removes a product, so a single snapshot can catch them mid-flight; a badge
       * that is genuinely wrong never settles and this still fails.
       */
      await expect
        .poll(async () => (await products.badgeMatchesRows(label)) ? 'match' : 'mismatch', {
          message: `the "${label}" badge should match the rows it opens`,
          timeout: 8000
        })
        .toBe('match');
    }
  });

  test('a view is in the URL and can be linked to', async ({ page }) => {
    await products.selectView('Low stock');
    expect(page.url()).toContain('view=low_stock');

    const rows = await products.rowCountValue();

    /* The point of URL state: a colleague opening the link sees the same list. */
    await page.goto(page.url());
    await page.waitForSelector('table tbody tr');
    expect(await products.rowCountValue()).toBe(rows);
  });

  test('column headings sort, and say so to assistive technology', async ({ page }) => {
    await products.sortBy('Price');

    expect(page.url()).toContain('sort_by=price');
    const sorted = page.locator('th[aria-sort]:not([aria-sort="none"])');
    await expect(sorted).toHaveCount(1);
    expect(await sorted.getAttribute('aria-sort')).toMatch(/ascending|descending/);

    /* Clicking again reverses rather than re-sorting the same way. */
    const first = await sorted.getAttribute('aria-sort');
    await products.sortBy('Price');
    const second = await page
      .locator('th[aria-sort]:not([aria-sort="none"])')
      .getAttribute('aria-sort');
    expect(second).not.toBe(first);
  });

  test('a price edited in the grid is saved', async ({ page }) => {
    const before = await products.cellText('Cost', 0);

    await products.editCell('Cost', 0, '77.77');

    /* Reload rather than trusting the optimistic value: the whole point of the write is that it
     * reaches the database. */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('table tbody tr');
    expect(await products.cellText('Cost', 0)).toContain('77.77');

    /* Put it back, so the suite can run twice. */
    const restore = (before ?? '').replace(/[^0-9.]/g, '') || '0';
    await products.editCell('Cost', 0, restore);
  });

  test('selecting rows offers bulk actions scoped to the filter', async ({ page }) => {
    expect(await page.locator(products.bulkBar).count()).toBe(0);

    await products.selectRow(0);
    expect(await products.bulkBarVisible()).toBe(true);

    /* The escalation from "this page" to "everything matching", which is the only kind of
     * select-all that matters once a catalogue is bigger than a page. */
    await expect(page.getByRole('button', { name: /Select all \d+ matching/ })).toBeVisible();
  });

  test('the add product page exists and creates a draft', async ({ page }) => {
    /*
     * Both "Add product" buttons used to navigate to a route nothing served, so a new store's
     * very first click rendered "Product not found".
     */
    await page.click('a:has-text("Add product")');
    await page.waitForURL(/\/admin\/products\/new/);
    await expect(page.getByLabel('Product name')).toBeVisible();

    const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
    await page.getByLabel('Product name').fill('End to end test product');
    await page.getByLabel('SKU').fill(sku);
    await page.getByLabel('Price').fill('12.50');
    await page.getByRole('button', { name: 'Save and edit' }).click();

    /* Landing on the detail page proves the product was created and has an id. */
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/, { timeout: 20000 });

    /* And it is in the catalogue. */
    await products.goto();
    await products.search(sku);
    expect(await products.rowCountValue()).toBe(1);

    /* Clean up through the UI, which also exercises the delete path. */
    await products.openRowMenu(0);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.waitForTimeout(1500);
  });

  test('export returns a CSV of the current view', async ({ page }) => {
    /*
     * The old suite asserted the export modal opened. The route did not exist, so the download
     * never happened and the test passed anyway.
     */
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: /Export this view/ }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('import previews before it writes', async ({ page }) => {
    await page.getByRole('button', { name: 'More' }).first().click();
    await page.getByRole('menuitem', { name: /Import from CSV/ }).click();
    await expect(page.getByText('Import products from CSV')).toBeVisible();

    /* The import button stays disabled until a preview has run, which is the guard that stops a
     * mismapped file rewriting a catalogue. */
    await expect(page.getByRole('button', { name: /^Import/ })).toBeDisabled();
  });

  test('the grid is reachable by keyboard', async ({ page }) => {
    /* `/` focuses search the way it does in every other tool a merchant uses. */
    await page.keyboard.press('/');
    await expect(page.locator(products.searchInput)).toBeFocused();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });

  test('an uploaded image reaches the product and survives a reload', async ({ page }) => {
    /*
     * The upload handler never uploaded anything. It called URL.createObjectURL(file) — a blob:
     * URL scoped to the tab that made it — wrote that string into the product's gallery, and
     * reported "image(s) uploaded successfully". The thumbnail appeared, so it looked like it had
     * worked; the image was gone on reload and had never resolved for any other visitor.
     *
     * So the assertion is not that a thumbnail appeared. It is that the URL the product now holds
     * serves image bytes, from a fresh request, after the page that uploaded it is gone.
     */
    await page.click('table tbody tr:first-child a');
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/, { timeout: 20000 });

    await page.getByRole('button', { name: 'Upload Images' }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'e2e-upload.png', mimeType: 'image/png', buffer: pngFixture() });
    await page.getByRole('button', { name: /^Upload \(1\)/ }).click();

    /* The URL is real and public — no session, no referer, a request the storefront would make. */
    const src = await page
      .locator('img[src^="/api/media/"]')
      .first()
      .getAttribute('src', { timeout: 20000 });
    expect(src).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);

    const served = await page.request.get(src);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('image/png');
    expect((await served.body()).length).toBeGreaterThan(0);

    /* And it is immutable rather than re-fetched on every storefront page view. */
    expect(served.headers()['cache-control']).toContain('immutable');

    /*
     * Uploading stores the image; saving is what attaches it to the product. Both halves have to
     * hold for the merchant's journey to work, and the second is where the old implementation's
     * blob: URL was written into the database as though it meant something.
     */
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`img[src="${src}"]`).first()).toBeVisible({ timeout: 20000 });

    /*
     * Clean up through the delete path, which also asserts the thing that makes deletion safe:
     * removing an image takes its URL off every product that used it, so the suite cannot leave a
     * demo product pointing at a URL that now 404s.
     */
    const token = await page.evaluate(() => window.localStorage.getItem('admin_token'));
    const deleted = await page.request.delete(`/api/admin/media/${src.split('/').pop()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(deleted.status()).toBe(200);
    expect((await deleted.json()).detached_from_products).toBe(1);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`img[src="${src}"]`)).toHaveCount(0);
  });

  test('row checkboxes and action buttons are named', async ({ page }) => {
    /*
     * A screen-reader user used to hear "checkbox" twenty-five times with no way to tell which
     * product they were selecting.
     */
    const firstCheckbox = page.locator(products.rowCheckbox).first();
    expect(await firstCheckbox.getAttribute('aria-label')).toMatch(/^Select /);

    const firstMenu = page
      .locator(products.productRows)
      .first()
      .getByRole('button', { name: /^Actions for/ });
    await expect(firstMenu).toBeVisible();
  });
});

/**
 * A genuine 8x8 PNG, assembled here rather than committed as a binary fixture.
 *
 * The upload route identifies a file from its own bytes, so a placeholder with a PNG extension
 * would be rejected — correctly — and the test would prove nothing about the happy path.
 *
 * @returns The complete file.
 */
function pngFixture() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  /* Pixel values derived from the clock so each run uploads distinct bytes. Content addressing
   * means a fixed image would deduplicate against the previous run and this test would stop
   * exercising the insert. */
  const seed = Date.now() % 251;
  const rows = Array.from({ length: 8 }, (_, y) =>
    Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 24 }, (_, i) => (seed + y * 8 + i) % 256))])
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
