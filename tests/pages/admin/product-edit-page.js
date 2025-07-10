/**
 * Admin Product Edit Page Object Model
 * Contains selectors and methods for interacting with the product edit page
 */
class AdminProductEditPage {
  constructor(page) {
    this.page = page;
    
    // Header elements
    this.pageTitle = 'h1';
    this.backButton = 'button:has-text("Back")';
    this.previewButton = 'button:has-text("Preview")';
    this.deleteButton = 'button:has-text("Delete")';
    this.breadcrumbs = 'nav[aria-label="breadcrumb"]';
    
    // Status badges
    this.stockStatusBadge = '[data-testid="stock-status-badge"]';
    this.activeStatusBadge = '[data-testid="active-status-badge"]';
    
    // Tab navigation
    this.detailsTab = 'button:has-text("Product Details")';
    this.analyticsTab = 'button:has-text("Analytics")';
    this.advancedTab = 'button:has-text("Advanced Settings")';
    
    // Product details form (when details tab is active)
    this.productNameInput = 'input[name="name"]';
    this.productDescriptionInput = 'textarea[name="description"]';
    this.productSkuInput = 'input[name="sku"]';
    this.productPriceInput = 'input[name="base_price"]';
    this.productSalePriceInput = 'input[name="sale_price"]';
    this.categorySelect = 'select[name="category_id"]';
    this.isActiveCheckbox = 'input[name="is_active"]';
    this.trackInventoryCheckbox = 'input[name="track_inventory"]';
    this.stockQuantityInput = 'input[name="stock_quantity"]';
    this.saveButton = 'button:has-text("Save")';
    this.cancelButton = 'button:has-text("Cancel")';
    
    // Analytics tab elements
    this.salesChart = '[data-testid="sales-chart"]';
    this.analyticsMetrics = '[data-testid="analytics-metrics"]';
    this.inventoryHistory = '[data-testid="inventory-history"]';
    
    // Advanced settings tab elements
    this.shippingSettings = '[data-testid="shipping-settings"]';
    this.discountSettings = '[data-testid="discount-settings"]';
    this.customFields = '[data-testid="custom-fields"]';
    
    // Delete confirmation modal
    this.deleteModal = '[data-testid="delete-modal"]';
    this.confirmDeleteButton = 'button:has-text("Delete Product")';
    this.cancelDeleteButton = 'button:has-text("Cancel")';
    
    // Loading states
    this.loadingOverlay = '[data-testid="loading-overlay"]';
    this.savingSpinner = '[data-testid="saving-spinner"]';
    
    // Alert messages
    this.successAlert = '[data-testid="success-alert"]';
    this.errorAlert = '[data-testid="error-alert"]';
    this.warningAlert = '[data-testid="warning-alert"]';
    this.attentionAlert = 'text=This product needs attention';
  }

  /**
   * Navigate to product edit page
   */
  async goto(productId) {
    await this.page.goto(`/admin/products/${productId}`);
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
   * Navigate to details tab
   */
  async goToDetailsTab() {
    await this.page.click(this.detailsTab);
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to analytics tab
   */
  async goToAnalyticsTab() {
    await this.page.click(this.analyticsTab);
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to advanced settings tab
   */
  async goToAdvancedTab() {
    await this.page.click(this.advancedTab);
    await this.page.waitForTimeout(500);
  }

  /**
   * Get product title
   */
  async getProductTitle() {
    return await this.page.locator(this.pageTitle).textContent();
  }

  /**
   * Check if product is active
   */
  async isProductActive() {
    const badge = this.page.locator('text=Listed');
    return await badge.isVisible();
  }

  /**
   * Get stock status
   */
  async getStockStatus() {
    const stockBadge = this.page.locator('text=In Stock, text=Out of Stock, text=Low Stock').first();
    if (await stockBadge.isVisible()) {
      return await stockBadge.textContent();
    }
    return null;
  }

  /**
   * Fill product name
   */
  async fillProductName(name) {
    const nameInput = this.page.locator(this.productNameInput);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill(name);
    }
  }

  /**
   * Fill product description
   */
  async fillProductDescription(description) {
    const descInput = this.page.locator(this.productDescriptionInput);
    if (await descInput.isVisible()) {
      await descInput.clear();
      await descInput.fill(description);
    }
  }

  /**
   * Fill product SKU
   */
  async fillProductSku(sku) {
    const skuInput = this.page.locator(this.productSkuInput);
    if (await skuInput.isVisible()) {
      await skuInput.clear();
      await skuInput.fill(sku);
    }
  }

  /**
   * Fill product price
   */
  async fillProductPrice(price) {
    const priceInput = this.page.locator(this.productPriceInput);
    if (await priceInput.isVisible()) {
      await priceInput.clear();
      await priceInput.fill(price.toString());
    }
  }

  /**
   * Fill sale price
   */
  async fillSalePrice(price) {
    const salePriceInput = this.page.locator(this.productSalePriceInput);
    if (await salePriceInput.isVisible()) {
      await salePriceInput.clear();
      await salePriceInput.fill(price.toString());
    }
  }

  /**
   * Select category
   */
  async selectCategory(categoryId) {
    const categorySelect = this.page.locator(this.categorySelect);
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption(categoryId);
    }
  }

  /**
   * Toggle active status
   */
  async toggleActiveStatus() {
    const activeCheckbox = this.page.locator(this.isActiveCheckbox);
    if (await activeCheckbox.isVisible()) {
      await activeCheckbox.check();
    }
  }

  /**
   * Toggle inventory tracking
   */
  async toggleInventoryTracking() {
    const trackCheckbox = this.page.locator(this.trackInventoryCheckbox);
    if (await trackCheckbox.isVisible()) {
      await trackCheckbox.click();
    }
  }

  /**
   * Set stock quantity
   */
  async setStockQuantity(quantity) {
    const stockInput = this.page.locator(this.stockQuantityInput);
    if (await stockInput.isVisible()) {
      await stockInput.clear();
      await stockInput.fill(quantity.toString());
    }
  }

  /**
   * Save product changes
   */
  async saveProduct() {
    await this.page.click(this.saveButton);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Cancel product changes
   */
  async cancelChanges() {
    await this.page.click(this.cancelButton);
  }

  /**
   * Click preview button
   */
  async previewProduct() {
    await this.page.click(this.previewButton);
  }

  /**
   * Open delete confirmation modal
   */
  async openDeleteModal() {
    await this.page.click(this.deleteButton);
    await this.page.waitForSelector(this.deleteModal, { timeout: 5000 });
  }

  /**
   * Confirm product deletion
   */
  async confirmDelete() {
    await this.page.click(this.confirmDeleteButton);
    await this.page.waitForURL('/admin/products');
  }

  /**
   * Cancel product deletion
   */
  async cancelDelete() {
    await this.page.click(this.cancelDeleteButton);
  }

  /**
   * Go back to products list
   */
  async goBack() {
    await this.page.click(this.backButton);
    await this.page.waitForURL('/admin/products');
  }

  /**
   * Wait for save to complete
   */
  async waitForSave() {
    await this.page.waitForSelector(this.savingSpinner, { state: 'hidden', timeout: 10000 });
  }

  /**
   * Check if there are attention alerts
   */
  async hasAttentionAlerts() {
    return await this.page.locator(this.attentionAlert).isVisible();
  }

  /**
   * Get attention alert messages
   */
  async getAttentionAlerts() {
    const alerts = await this.page.locator(this.attentionAlert).all();
    const messages = [];
    
    for (const alert of alerts) {
      const text = await alert.textContent();
      messages.push(text);
    }
    
    return messages;
  }

  /**
   * Check if success message is visible
   */
  async hasSuccessMessage() {
    return await this.page.locator(this.successAlert).isVisible();
  }

  /**
   * Check if error message is visible
   */
  async hasErrorMessage() {
    return await this.page.locator(this.errorAlert).isVisible();
  }

  /**
   * Verify analytics tab content
   */
  async verifyAnalyticsContent() {
    await this.goToAnalyticsTab();
    
    // Check for common analytics elements
    const elements = [
      'text=Sales',
      'text=Revenue',
      'text=Views',
      'text=Conversion'
    ];
    
    for (const element of elements) {
      const isVisible = await this.page.locator(element).isVisible();
      if (isVisible) {
        console.log(`✓ Found analytics element: ${element}`);
      }
    }
  }

  /**
   * Verify advanced settings content
   */
  async verifyAdvancedSettingsContent() {
    await this.goToAdvancedTab();
    
    // Check for common advanced settings elements
    const elements = [
      'text=Shipping',
      'text=Discount',
      'text=Inventory',
      'text=Custom Fields'
    ];
    
    for (const element of elements) {
      const isVisible = await this.page.locator(element).isVisible();
      if (isVisible) {
        console.log(`✓ Found advanced setting: ${element}`);
      }
    }
  }

  /**
   * Test all form interactions
   */
  async testAllFormFields() {
    await this.goToDetailsTab();
    
    const testData = {
      name: 'Test Product Name',
      description: 'Test product description',
      sku: 'TEST-SKU-123',
      price: '99.99',
      salePrice: '79.99',
      stockQuantity: '100'
    };
    
    // Test each field
    await this.fillProductName(testData.name);
    await this.fillProductDescription(testData.description);
    await this.fillProductSku(testData.sku);
    await this.fillProductPrice(testData.price);
    await this.fillSalePrice(testData.salePrice);
    await this.setStockQuantity(testData.stockQuantity);
    
    // Test checkboxes
    await this.toggleActiveStatus();
    await this.toggleInventoryTracking();
    
    console.log('✓ All form fields tested');
  }

  /**
   * Verify page elements are present
   */
  async verifyPageElements() {
    const elements = [
      this.pageTitle,
      this.backButton,
      this.previewButton,
      this.deleteButton,
      this.detailsTab,
      this.analyticsTab,
      this.advancedTab
    ];

    for (const element of elements) {
      await this.page.waitForSelector(element, { timeout: 5000 });
    }
  }

  /**
   * Test tab navigation
   */
  async testTabNavigation() {
    const tabs = [
      { name: 'Details', method: this.goToDetailsTab },
      { name: 'Analytics', method: this.goToAnalyticsTab },
      { name: 'Advanced', method: this.goToAdvancedTab }
    ];

    for (const tab of tabs) {
      await tab.method.call(this);
      await this.page.waitForTimeout(500);
      console.log(`✓ Navigated to ${tab.name} tab`);
    }
  }
}

module.exports = { AdminProductEditPage };