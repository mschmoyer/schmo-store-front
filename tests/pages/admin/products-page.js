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
    
    // Stats cards
    this.totalProductsCard = 'text=Total Products';
    this.activeProductsCard = 'text=Active';
    this.inStockCard = 'text=In Stock';
    this.outOfStockCard = 'text=Out of Stock';
    this.inventoryValueCard = 'text=Inventory Value';
    
    // Search and filters
    this.searchInput = 'input[placeholder="Search products..."]';
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

  /**
   * Filter by status
   */
  async filterByStatus(status) {
    const statusSelect = this.page.locator('select').first();
    await statusSelect.selectOption(status);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Filter by stock status
   */
  async filterByStock(stockStatus) {
    const stockSelect = this.page.locator('select').nth(1);
    await stockSelect.selectOption(stockStatus);
    await this.page.waitForLoadState('networkidle');
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
  async sortBy(sortField) {
    const sortSelect = this.page.locator('select').last();
    await sortSelect.selectOption(sortField);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Toggle sort order (asc/desc)
   */
  async toggleSortOrder() {
    const sortToggle = this.page.locator('button').filter({ hasText: /sort/i }).last();
    await sortToggle.click();
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
    const firstRow = this.page.locator(this.productRows).first();
    const editBtn = firstRow.locator('button').filter({ hasText: /edit/i }).first();
    await editBtn.click();
  }

  /**
   * Open product action menu for specific product
   */
  async openProductActionMenu(productIndex = 0) {
    const productRow = this.page.locator(this.productRows).nth(productIndex);
    const actionBtn = productRow.locator('button').last();
    await actionBtn.click();
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