/**
 * Admin Products Page Object Model
 * Contains selectors and methods for interacting with the admin products page
 */
class AdminProductsPage {
  constructor(page) {
    this.page = page;
    
    // Main page selectors
    this.pageTitle = 'h1:has-text("Products")';
    this.addProductButton = 'text=Add Product';
    this.refreshButton = 'text=Refresh';
    this.actionsButton = 'text=Actions';
    
    /*
     * Stat cards and the search box.
     *
     * These selectors were written against copy the page no longer uses —
     * title-cased tile labels and a bare "Search products..." placeholder —
     * so every test in this suite failed in `verifyPageElements` rather than
     * on anything it was meant to check.
     *
     * The tiles now also carry a **Margin** column alongside them in the
     * table: price and cost were already on every row, and one column turns
     * the catalog into a pricing tool. It divides by retail, not by cost.
     */
    // Scoped to the stat card's own label element. A bare `text=Active` also
    // matches the status filter's options and the per-row status badges.
    // Scoped to the stat card's own label element. A bare `text=Active` also
    // matches the status filter's options and the per-row status badges.
    this.totalProductsCard = '[class*="StatCard-module"]:text-is("Total products")';
    this.activeProductsCard = '[class*="StatCard-module"]:text-is("Active")';
    this.inStockCard = '[class*="StatCard-module"]:text-is("In stock")';
    this.outOfStockCard = '[class*="StatCard-module"]:text-is("Out of stock")';
    this.inventoryValueCard = '[class*="StatCard-module"]:text-is("Inventory value")';
    this.marginColumn = 'th:has-text("Margin")';

    // Search and filters
    this.searchInput = 'input[placeholder="Search products (min 3 characters)..."]';
    this.statusFilter = 'select[data-testid="status-filter"]';
    this.stockFilter = 'select[data-testid="stock-filter"]';
    this.advancedFiltersButton = 'text=Advanced Filters';
    this.sortSelect = 'select[data-testid="sort-select"]';
    this.sortOrderToggle = 'button[data-testid="sort-order-toggle"]';
    
    // Table elements
    this.productsTable = 'table';
    this.tableHeaders = 'table thead tr';
    this.productRows = 'table tbody tr';
    this.selectAllCheckbox = 'table thead input[type="checkbox"]';
    this.productCheckbox = 'table tbody tr input[type="checkbox"]';
    
    // Actions menu
    this.exportProductsOption = 'text=Export Products';
    this.importProductsOption = 'text=Import Products';
    this.bulkActionsOption = 'text=Bulk Actions';
    
    // Modals
    this.advancedFiltersModal = '[data-testid="advanced-filters-modal"]';
    this.exportModal = '[data-testid="export-modal"]';
    this.importModal = '[data-testid="import-modal"]';
    this.bulkActionsModal = '[data-testid="bulk-actions-modal"]';
    
    // Pagination
    this.pagination = 'nav[role="navigation"]';
    this.nextPageButton = 'button:has-text("Next")';
    this.prevPageButton = 'button:has-text("Previous")';
    
    // Empty state
    this.emptyStateMessage = 'text=No products found';
    this.addFirstProductButton = 'text=Add Your First Product';
  }

  /**
   * Navigate to products page
   */
  async goto() {
    await this.page.goto('/admin/products');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for page to load
   */
  async waitForPageLoad() {
    await this.page.waitForSelector(this.pageTitle, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Perform search
   */
  async search(query) {
    await this.page.fill(this.searchInput, query);
    await this.page.waitForTimeout(600); // Wait for debounced search
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Clear search
   */
  async clearSearch() {
    await this.page.fill(this.searchInput, '');
    await this.page.waitForTimeout(600);
    await this.page.waitForLoadState('networkidle');
  }

  /*
   * The filters and the sort control are Mantine `Select`s, not native
   * `<select>` elements — they render a text input plus a portalled option
   * list — so `selectOption()` had nothing to act on and every filter and sort
   * test timed out. They are driven the way a user drives them: click the
   * control, click the option.
   */

  /**
   * Pick an option from one of the toolbar's Mantine Selects.
   *
   * Two hazards are handled here, both of which produced intermittent red
   * rather than honest failures:
   *
   * - **The control is addressed by accessible name, not placeholder.** A
   *   Select that already holds a value renders no placeholder, so a
   *   placeholder locator worked on a pristine page and broke the moment a
   *   workflow had set a filter.
   * - **The dropdown detaches mid-click.** The products list re-renders when a
   *   fetch resolves, and the search box debounces by 300ms — so the network
   *   can be idle while a fetch is still queued, land during the click, and
   *   tear the portalled option list out of the DOM. Settling past the
   *   debounce and then to idle again makes the toolbar genuinely still; one
   *   retry covers the rest.
   *
   * @param controlName - The Select's accessible name.
   * @param optionLabel - The visible option label.
   */
  async selectOption(controlName, optionLabel) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(700);
        await this.page.waitForLoadState('networkidle');

        await this.page.getByRole('textbox', { name: controlName }).click();
        const option = this.page.getByRole('option', { name: optionLabel, exact: true });
        await option.waitFor({ state: 'visible', timeout: 5000 });
        await option.click({ timeout: 5000 });
        await this.page.waitForLoadState('networkidle');
        return;
      } catch (error) {
        if (attempt === 2) throw error;
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
      }
    }
  }

  /**
   * Filter by status.
   *
   * @param status - The visible option label, e.g. `Active`.
   */
  async filterByStatus(status) {
    await this.selectOption('Filter by status', status);
  }

  /**
   * Filter by stock status.
   *
   * @param stockStatus - The visible option label, e.g. `In Stock`.
   */
  async filterByStock(stockStatus) {
    await this.selectOption('Filter by stock', stockStatus);
  }

  /**
   * Open advanced filters modal
   */
  async openAdvancedFilters() {
    await this.page.click(this.advancedFiltersButton);
    await this.page.waitForSelector('text=Advanced Filters', { timeout: 5000 });
  }

  /**
   * Close advanced filters modal
   */
  async closeAdvancedFilters() {
    const cancelBtn = this.page.locator('button:has-text("Cancel")');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  /**
   * Change sort order
   */
  /**
   * Sort by a field.
   *
   * @param sortField - The visible option label, e.g. `Name`.
   */
  async sortBy(sortField) {
    await this.selectOption('Sort by', sortField);
  }

  /**
   * Toggle sort order (asc/desc)
   */
  async toggleSortOrder() {
    // The control is icon-only; it now carries an aria-label, so it can be
    // reached by role instead of by a text filter that matched nothing.
    await this.page.getByRole('button', { name: /^Sort (ascending|descending)/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click actions menu
   */
  async openActionsMenu() {
    await this.page.click(this.actionsButton);
  }

  /**
   * Open export modal
   */
  async openExportModal() {
    await this.openActionsMenu();
    await this.page.click(this.exportProductsOption);
    await this.page.waitForSelector('text=Export Format', { timeout: 5000 });
  }

  /**
   * Open import modal
   */
  async openImportModal() {
    await this.openActionsMenu();
    await this.page.click(this.importProductsOption);
    await this.page.waitForSelector('text=Select file', { timeout: 5000 });
  }

  /**
   * Open bulk actions modal
   */
  async openBulkActionsModal() {
    await this.openActionsMenu();
    await this.page.click(this.bulkActionsOption);
    await this.page.waitForSelector('text=selected', { timeout: 5000 });
  }

  /**
   * Close modal (generic)
   */
  async closeModal() {
    const cancelBtn = this.page.locator('button:has-text("Cancel")');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  /**
   * Get product count
   */
  async getProductCount() {
    const rows = this.page.locator(this.productRows);
    return await rows.count();
  }

  /**
   * Select product by index
   */
  async selectProduct(index) {
    const checkbox = this.page.locator(this.productRows).nth(index).locator('input[type="checkbox"]');
    await checkbox.check();
  }

  /**
   * Select all products
   */
  async selectAllProducts() {
    await this.page.click(this.selectAllCheckbox);
  }

  /**
   * Click add product button
   */
  async clickAddProduct() {
    await this.page.click(this.addProductButton);
  }

  /**
   * Click refresh button
   */
  async clickRefresh() {
    await this.page.click(this.refreshButton);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get first product's edit button and click it
   */
  async editFirstProduct() {
    // Icon-only buttons carry no text, so `hasText: /edit/i` matched nothing.
    // They now have aria-labels of the form `Edit <product name>`.
    const firstRow = this.page.locator(this.productRows).first();
    await firstRow.getByRole('button', { name: /^Edit / }).click();
  }

  /**
   * Open product action menu for specific product
   */
  async openProductActionMenu(productIndex = 0) {
    const productRow = this.page.locator(this.productRows).nth(productIndex);
    await productRow.getByRole('button', { name: /^More actions for / }).click();
  }

  /**
   * Toggle product status (list/unlist)
   */
  async toggleProductStatus(productIndex = 0) {
    await this.openProductActionMenu(productIndex);
    const toggleOption = this.page.locator('text=List Product, text=Unlist Product').first();
    await toggleOption.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to next page
   */
  async goToNextPage() {
    const nextBtn = this.page.locator(this.nextPageButton);
    if (await nextBtn.isVisible() && !(await nextBtn.isDisabled())) {
      await nextBtn.click();
      await this.page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }

  /**
   * Navigate to previous page
   */
  async goToPrevPage() {
    const prevBtn = this.page.locator(this.prevPageButton);
    if (await prevBtn.isVisible() && !(await prevBtn.isDisabled())) {
      await prevBtn.click();
      await this.page.waitForLoadState('networkidle');
      return true;
    }
    return false;
  }

  /**
   * Check if page is in empty state
   */
  async isEmptyState() {
    return await this.page.locator(this.emptyStateMessage).isVisible();
  }

  /**
   * Check if pagination exists
   */
  async hasPagination() {
    return await this.page.locator(this.pagination).isVisible();
  }

  /**
   * Get stats card values
   */
  async getStats() {
    const stats = {};
    
    // This would need to be implemented based on the actual DOM structure
    // For now, we'll return a placeholder
    stats.total = await this.page.locator('text=Total Products').count();
    stats.active = await this.page.locator('text=Active').count();
    
    return stats;
  }

  /**
   * Verify all key elements are visible
   */
  async verifyPageElements() {
    const elements = [
      this.pageTitle,
      this.addProductButton,
      this.refreshButton,
      this.actionsButton,
      this.searchInput,
      this.totalProductsCard,
      this.activeProductsCard,
      this.inStockCard,
      this.outOfStockCard,
      this.inventoryValueCard
    ];

    for (const element of elements) {
      await this.page.waitForSelector(element, { timeout: 5000 });
    }
  }

  /**
   * Test all interactive elements
   */
  async testInteractiveElements() {
    const interactiveElements = await this.page.locator('button, input, select, a[href]').all();
    let accessibleCount = 0;
    
    for (const element of interactiveElements) {
      if (await element.isVisible() && await element.isEnabled()) {
        accessibleCount++;
      }
    }
    
    return {
      total: interactiveElements.length,
      accessible: accessibleCount
    };
  }
}

module.exports = { AdminProductsPage };