/**
 * Page object for the admin catalogue.
 *
 * Rewritten alongside the page. The previous version was built around controls that no longer
 * exist — a "Refresh" button beside the sync button, a sort `<Select>` in the filter bar, per-row
 * Edit and View icons that both opened the same URL, and modals identified by `data-testid`
 * attributes.
 *
 * It is also much smaller, deliberately. Most of what it used to expose were helpers for opening
 * dialogs, which let the specs assert that a modal appeared and stop there — so three features
 * whose endpoints did not exist passed their tests for as long as they existed. The helpers here
 * are the ones a spec needs to assert an *outcome*: what the grid contains, what a cell says after
 * an edit, what the URL holds after a filter.
 */

const { expect } = require('@playwright/test');

class AdminProductsPage {
  constructor(page) {
    this.page = page;

    this.pageTitle = 'h1:has-text("Products")';
    this.addProductButton = 'a:has-text("Add product")';
    this.searchInput = 'input[aria-label="Search products"]';
    this.productsTable = 'table';
    this.productRows = 'table tbody tr';
    this.selectAllCheckbox = 'table thead input[type="checkbox"]';
    this.rowCheckbox = 'table tbody tr input[type="checkbox"]';
    this.bulkBar = '[role="region"][aria-label*="Bulk actions"]';
    this.rowCount = 'text=/\\d+–\\d+ of \\d+/';
  }

  /**
   * Open the catalogue and wait for it to have rendered rows or an empty state.
   *
   * Waiting for one or the other rather than a fixed delay is what keeps these specs from being
   * flaky on a cold dev server.
   */
  async goto() {
    await this.page.goto('/admin/products');
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.page.waitForSelector(this.productRows, { timeout: 20000 }),
      this.page.waitForSelector('text=No products yet', { timeout: 20000 }),
      this.page.waitForSelector('text=Nothing matches that', { timeout: 20000 })
    ]);
  }

  /** @returns The number of rows currently rendered. */
  async rowCountValue() {
    return this.page.locator(this.productRows).count();
  }

  /**
   * Switch to a saved view by its visible label.
   *
   * @param label - The tab's label, such as "Low stock".
   */
  async selectView(label) {
    await this.page.locator('[role=tab]').filter({ hasText: label }).first().click();
    await this.page.waitForTimeout(800);
  }

  /**
   * Read a view tab's badge count.
   *
   * @param label - The tab's label.
   * @returns The badge number, or null when the tab has none.
   */
  async viewCount(label) {
    const text = await this.page.locator('[role=tab]').filter({ hasText: label }).first().textContent();
    const match = /(\d+)$/.exec(text ?? '');
    return match ? Number(match[1]) : null;
  }

  /**
   * Read a view's badge and its rendered row count together.
   *
   * Both change at once when the catalogue is mutated, so they have to be sampled as a pair for
   * the comparison to mean anything under concurrency.
   *
   * @param label - The tab's label.
   * @returns Whether the badge and the row count agree.
   */
  async badgeMatchesRows(label) {
    const badge = await this.viewCount(label);
    const empty = await this.page.getByText('Nothing matches that').count();
    const rows = empty ? 0 : await this.rowCountValue();
    return badge === rows;
  }

  /**
   * Type into the search box and wait for the debounced request to land.
   *
   * @param term - What to search for.
   */
  async search(term) {
    const input = this.page.locator(this.searchInput);
    await input.waitFor({ state: 'visible' });
    await input.fill(term);

    /*
     * Wait for the term to reach the URL rather than for a fixed delay. The search is debounced and
     * then navigates, so a timeout long enough on a warm server is not long enough on a cold one —
     * and a fill that lands before hydration never registers at all, which shows up as the grid
     * returning everything.
     */
    await this.page.waitForURL(new RegExp(`search=${encodeURIComponent(term)}`), { timeout: 15000 });
    await this.page.waitForTimeout(600);
  }

  /**
   * Sort by clicking a column heading.
   *
   * @param label - The heading's text, such as "Price".
   */
  async sortBy(label) {
    await this.page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
    await this.page.waitForTimeout(800);
  }

  /**
   * Edit a numeric cell in place.
   *
   * @param label - The cell's accessible name prefix, such as "Cost".
   * @param rowIndex - Which row, zero-based.
   * @param value - The value to type.
   */
  async editCell(label, rowIndex, value) {
    const cell = this.page
      .getByRole('button', { name: new RegExp(`^${label} for .*Select to edit`) })
      .nth(rowIndex);
    await cell.click();
    const input = this.page.locator(`input[aria-label^="${label} for"]`);
    await input.fill(String(value));
    await input.press('Enter');
    await this.page.waitForTimeout(1200);
  }

  /**
   * Read a numeric cell's rendered text.
   *
   * @param label - The cell's accessible name prefix.
   * @param rowIndex - Which row, zero-based.
   * @returns The cell's text.
   */
  async cellText(label, rowIndex) {
    return (
      await this.page
        .getByRole('button', { name: new RegExp(`^${label} for .*Select to edit`) })
        .nth(rowIndex)
        .textContent()
    )?.trim();
  }

  /**
   * Tick a row's checkbox.
   *
   * @param rowIndex - Which row, zero-based.
   */
  async selectRow(rowIndex) {
    await this.page.locator(this.rowCheckbox).nth(rowIndex).check();
    await this.page.waitForTimeout(300);
  }

  /** @returns Whether the bulk action bar is showing. */
  async bulkBarVisible() {
    return this.page.locator(this.bulkBar).isVisible();
  }

  /**
   * Open a row's action menu.
   *
   * @param rowIndex - Which row, zero-based.
   */
  async openRowMenu(rowIndex) {
    await this.page
      .locator(this.productRows)
      .nth(rowIndex)
      .getByRole('button', { name: /^Actions for/ })
      .click();
  }

  /** @returns The SKUs rendered in the grid, in order. */
  async visibleSkus() {
    return this.page.locator('table tbody tr code, table tbody tr [class*="code"]').allTextContents();
  }

  /**
   * Assert the page's core furniture is present.
   *
   * Deliberately a short list: a spec that enumerates every control turns a layout change into a
   * test failure without telling anyone whether the page still works.
   */
  async expectLoaded() {
    await expect(this.page.locator(this.pageTitle)).toBeVisible();
    await expect(this.page.locator(this.searchInput)).toBeVisible();
    await expect(this.page.locator('[role=tab]').first()).toBeVisible();
  }
}

module.exports = { AdminProductsPage };
