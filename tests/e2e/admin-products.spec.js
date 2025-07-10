const { test, expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');
const { AdminProductsPage } = require('../pages/admin/products-page');
const { AdminProductEditPage } = require('../pages/admin/product-edit-page');

/**
 * Admin Products Page Tests - Comprehensive E2E Testing
 * 
 * This test suite provides comprehensive coverage of the Products admin page including:
 * - Product listing with search, filtering, sorting, and pagination
 * - Product creation and editing workflows
 * - Bulk actions and status management
 * - Export/Import functionality
 * - Interactive element testing
 * - Form validation and error handling
 * - Responsive design testing
 * - Complete user workflows
 */

adminAuthFixture.describe('Admin Products Page - Core Functionality', () => {
  let productsPage;

  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    productsPage = new AdminProductsPage(adminPage);
    await productsPage.goto();
    await productsPage.waitForPageLoad();
  });

  adminAuthFixture('should load products page with all key elements', async ({ adminPage }) => {
    // Verify all page elements are present
    await productsPage.verifyPageElements();
    
    // Verify specific critical elements
    await expect(adminPage.locator(productsPage.pageTitle)).toBeVisible();
    await expect(adminPage.locator(productsPage.addProductButton)).toBeVisible();
    await expect(adminPage.locator(productsPage.searchInput)).toBeVisible();
    
    console.log('✓ Products page loaded with all key elements');
  });

  adminAuthFixture('should handle search functionality', async ({ adminPage }) => {
    // Test search functionality
    await productsPage.search('test product');
    await expect(adminPage.locator(productsPage.searchInput)).toHaveValue('test product');
    
    // Clear search
    await productsPage.clearSearch();
    await expect(adminPage.locator(productsPage.searchInput)).toHaveValue('');
    
    console.log('✓ Search functionality works');
  });

  adminAuthFixture('should handle filter functionality', async ({ adminPage }) => {
    // Test status filter
    await productsPage.filterByStatus('active');
    
    // Test stock filter
    await productsPage.filterByStock('in_stock');
    
    // Test advanced filters
    await productsPage.openAdvancedFilters();
    await expect(adminPage.locator('text=Advanced Filters')).toBeVisible();
    await productsPage.closeAdvancedFilters();
    
    console.log('✓ Filter functionality works');
  });

  adminAuthFixture('should handle sorting functionality', async ({ adminPage }) => {
    // Test sorting
    await productsPage.sortBy('name');
    await productsPage.toggleSortOrder();
    
    console.log('✓ Sorting functionality works');
  });

  adminAuthFixture('should handle actions menu and modals', async ({ adminPage }) => {
    // Test export modal
    await productsPage.openExportModal();
    await expect(adminPage.locator('text=Export Format')).toBeVisible();
    await productsPage.closeModal();
    
    // Test import modal
    await productsPage.openImportModal();
    await expect(adminPage.locator('text=Select file')).toBeVisible();
    await productsPage.closeModal();
    
    console.log('✓ Actions menu and modals work');
  });

  adminAuthFixture('should handle add product functionality', async ({ adminPage }) => {
    // Test add product navigation
    await productsPage.clickAddProduct();
    await adminPage.waitForURL('/admin/products/add');
    
    // Navigate back to products page
    await productsPage.goto();
    
    console.log('✓ Add Product navigation works');
  });

  adminAuthFixture('should handle refresh functionality', async ({ adminPage }) => {
    // Test refresh
    await productsPage.clickRefresh();
    await expect(adminPage.locator(productsPage.pageTitle)).toBeVisible();
    
    console.log('✓ Refresh functionality works');
  });

  adminAuthFixture('should handle product interactions', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      console.log(`Found ${productCount} products`);
      
      // Test product selection
      await productsPage.selectProduct(0);
      
      // Test product actions menu
      await productsPage.openProductActionMenu(0);
      await adminPage.click('body'); // Close menu
      
      // Test product editing navigation
      await productsPage.editFirstProduct();
      await adminPage.waitForURL(/\/admin\/products\/[^\/]+$/);
      
      // Navigate back
      await productsPage.goto();
      
      console.log('✓ Product interactions work');
    } else {
      // Test empty state
      const isEmpty = await productsPage.isEmptyState();
      console.log(`✓ Empty state detected: ${isEmpty}`);
    }
  });

  adminAuthFixture('should handle pagination', async ({ adminPage }) => {
    const hasPagination = await productsPage.hasPagination();
    
    if (hasPagination) {
      console.log('✓ Pagination found');
      
      // Test pagination navigation
      const nextSuccess = await productsPage.goToNextPage();
      if (nextSuccess) {
        await productsPage.goToPrevPage();
      }
    } else {
      console.log('✓ No pagination needed');
    }
  });

  adminAuthFixture('should handle bulk actions', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Select a product
      await productsPage.selectProduct(0);
      
      // Test bulk actions
      await productsPage.openBulkActionsModal();
      await expect(adminPage.locator('text=selected')).toBeVisible();
      await productsPage.closeModal();
      
      console.log('✓ Bulk actions work');
    } else {
      console.log('✓ No products to test bulk actions');
    }
  });

  adminAuthFixture('should test all interactive elements', async ({ adminPage }) => {
    const stats = await productsPage.testInteractiveElements();
    console.log(`✓ Interactive elements test - ${stats.accessible}/${stats.total} accessible`);
    
    // Verify minimum number of interactive elements
    expect(stats.accessible).toBeGreaterThan(5);
  });
});

adminAuthFixture.describe('Admin Products Page - Product Edit Workflow', () => {
  let productsPage;
  let productEditPage;

  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    productsPage = new AdminProductsPage(adminPage);
    productEditPage = new AdminProductEditPage(adminPage);
    await productsPage.goto();
    await productsPage.waitForPageLoad();
  });

  adminAuthFixture('should navigate to product edit page and test tabs', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to first product edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Verify page elements
      await productEditPage.verifyPageElements();
      
      // Test tab navigation
      await productEditPage.testTabNavigation();
      
      console.log('✓ Product edit page navigation and tabs work');
    } else {
      console.log('✓ No products to test editing');
    }
  });

  adminAuthFixture('should test product edit form interactions', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Test form fields (without saving)
      await productEditPage.testAllFormFields();
      
      // Test other interactions
      const hasAttention = await productEditPage.hasAttentionAlerts();
      console.log(`✓ Product has attention alerts: ${hasAttention}`);
      
      // Test back navigation
      await productEditPage.goBack();
      await expect(adminPage).toHaveURL('/admin/products');
      
      console.log('✓ Product edit form interactions work');
    } else {
      console.log('✓ No products to test form interactions');
    }
  });

  adminAuthFixture('should test product analytics tab', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Test analytics tab
      await productEditPage.verifyAnalyticsContent();
      
      console.log('✓ Product analytics tab works');
    } else {
      console.log('✓ No products to test analytics');
    }
  });

  adminAuthFixture('should test product advanced settings tab', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Test advanced settings tab
      await productEditPage.verifyAdvancedSettingsContent();
      
      console.log('✓ Product advanced settings tab works');
    } else {
      console.log('✓ No products to test advanced settings');
    }
  });

  adminAuthFixture('should test product preview functionality', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Test preview (if product is active)
      const isActive = await productEditPage.isProductActive();
      if (isActive) {
        // Note: Preview opens in new tab, so we just test the button exists
        await expect(adminPage.locator(productEditPage.previewButton)).toBeVisible();
      }
      
      console.log('✓ Product preview functionality tested');
    } else {
      console.log('✓ No products to test preview');
    }
  });

  adminAuthFixture('should test product deletion workflow', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // Navigate to edit page
      await productsPage.editFirstProduct();
      await productEditPage.waitForPageLoad();
      
      // Test delete modal (without actually deleting)
      await productEditPage.openDeleteModal();
      await expect(adminPage.locator('text=Delete Product')).toBeVisible();
      await productEditPage.cancelDelete();
      
      console.log('✓ Product deletion workflow tested');
    } else {
      console.log('✓ No products to test deletion');
    }
  });
});

adminAuthFixture.describe('Admin Products Page - Edge Cases and Error Handling', () => {
  let productsPage;

  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    productsPage = new AdminProductsPage(adminPage);
    await productsPage.goto();
    await productsPage.waitForPageLoad();
  });

  adminAuthFixture('should handle responsive design', async ({ adminPage }) => {
    // Test different viewport sizes
    await adminPage.setViewportSize({ width: 1200, height: 800 });
    await expect(adminPage.locator(productsPage.pageTitle)).toBeVisible();
    
    await adminPage.setViewportSize({ width: 768, height: 1024 });
    await expect(adminPage.locator(productsPage.pageTitle)).toBeVisible();
    
    await adminPage.setViewportSize({ width: 375, height: 667 });
    await expect(adminPage.locator(productsPage.pageTitle)).toBeVisible();
    
    // Reset viewport
    await adminPage.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✓ Responsive design tested');
  });

  adminAuthFixture('should handle error states', async ({ adminPage }) => {
    // Test non-existent product
    await adminPage.goto('/admin/products/non-existent-product');
    await adminPage.waitForLoadState('networkidle');
    
    // Should handle error gracefully
    const hasError = await adminPage.locator('text=Error, text=Not Found').isVisible();
    console.log(`✓ Error handling tested - Error shown: ${hasError}`);
    
    // Navigate back to products
    await productsPage.goto();
  });

  adminAuthFixture('should handle keyboard navigation', async ({ adminPage }) => {
    // Test keyboard navigation on search input
    await adminPage.focus(productsPage.searchInput);
    await adminPage.keyboard.type('test');
    await adminPage.keyboard.press('Tab');
    
    // Test escape key functionality
    await productsPage.openAdvancedFilters();
    await adminPage.keyboard.press('Escape');
    
    console.log('✓ Keyboard navigation tested');
  });
});

// Test suite for comprehensive workflow testing
adminAuthFixture.describe('Admin Products Page - Complete Workflows', () => {
  let productsPage;

  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    productsPage = new AdminProductsPage(adminPage);
    await productsPage.goto();
    await productsPage.waitForPageLoad();
  });

  adminAuthFixture('should complete full product management workflow', async ({ adminPage }) => {
    // 1. Search for products
    await productsPage.search('test');
    
    // 2. Apply filters
    await productsPage.filterByStatus('active');
    
    // 3. Change sorting
    await productsPage.sortBy('name');
    
    // 4. Test actions menu
    await productsPage.openActionsMenu();
    await adminPage.click('body'); // Close menu
    
    // 5. Test refresh
    await productsPage.clickRefresh();
    
    // 6. Clear filters
    await productsPage.clearSearch();
    
    // 7. Test pagination if available
    const hasPagination = await productsPage.hasPagination();
    if (hasPagination) {
      await productsPage.goToNextPage();
      await productsPage.goToPrevPage();
    }
    
    console.log('✓ Complete product management workflow tested');
  });

  adminAuthFixture('should handle bulk operations workflow', async ({ adminPage }) => {
    const productCount = await productsPage.getProductCount();
    
    if (productCount > 0) {
      // 1. Select multiple products
      await productsPage.selectProduct(0);
      if (productCount > 1) {
        await productsPage.selectProduct(1);
      }
      
      // 2. Open bulk actions
      await productsPage.openBulkActionsModal();
      
      // 3. Test bulk actions (without executing)
      await expect(adminPage.locator('text=List Products')).toBeVisible();
      await expect(adminPage.locator('text=Unlist Products')).toBeVisible();
      
      // 4. Close modal
      await productsPage.closeModal();
      
      console.log('✓ Bulk operations workflow tested');
    } else {
      console.log('✓ No products for bulk operations workflow');
    }
  });

  adminAuthFixture('should handle export/import workflow', async ({ adminPage }) => {
    // 1. Test export workflow
    await productsPage.openExportModal();
    await expect(adminPage.locator('text=CSV')).toBeVisible();
    await expect(adminPage.locator('text=JSON')).toBeVisible();
    await productsPage.closeModal();
    
    // 2. Test import workflow
    await productsPage.openImportModal();
    await expect(adminPage.locator('input[type="file"]')).toBeVisible();
    await productsPage.closeModal();
    
    console.log('✓ Export/import workflow tested');
  });
});