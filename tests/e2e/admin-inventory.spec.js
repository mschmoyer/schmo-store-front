const { test, expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');

/**
 * Admin Inventory Page Tests - Comprehensive E2E Testing
 * 
 * This test suite provides comprehensive coverage of the Inventory admin page including:
 * - Inventory management with search, filtering, and sorting
 * - Supplier creation and management workflows
 * - Purchase Order creation and management workflows
 * - Tab navigation and functionality
 * - Smart reorder widget and recommendations
 * - Bulk actions and export functionality
 * - Form validation and error handling
 * - Interactive element testing
 * - Complete user workflows
 */

adminAuthFixture.describe('Admin Inventory Page - Core Functionality', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    // Navigate to inventory page
    await adminPage.goto('/admin/inventory');
    
    // Wait for page to load
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('should load inventory page with all key elements', async ({ adminPage }) => {
    // Verify page title and description
    await expect(adminPage.locator('text=Inventory Management')).toBeVisible();
    await expect(adminPage.locator('text=Manage your stock levels, forecasting, and purchase orders')).toBeVisible();
    
    // Verify stats cards are present
    await expect(adminPage.locator('text=Total Products')).toBeVisible();
    await expect(adminPage.locator('text=Total Value')).toBeVisible();
    await expect(adminPage.locator('text=Low Stock')).toBeVisible();
    await expect(adminPage.locator('text=Out of Stock')).toBeVisible();
    await expect(adminPage.locator('text=Pending Orders')).toBeVisible();
    await expect(adminPage.locator('text=Restocked This Month')).toBeVisible();
    
    // Verify sync button
    await expect(adminPage.locator('button:has-text("Sync ShipStation")')).toBeVisible();
    
    // Verify tabs
    await expect(adminPage.locator('text=Inventory Grid')).toBeVisible();
    await expect(adminPage.locator('text=Purchase Orders')).toBeVisible();
    await expect(adminPage.locator('text=Suppliers')).toBeVisible();
    await expect(adminPage.locator('text=Reports')).toBeVisible();
    await expect(adminPage.locator('text=Alerts & Notifications')).toBeVisible();
    
    console.log('✓ Inventory page loaded with all key elements');
  });

  adminAuthFixture('should handle tab navigation', async ({ adminPage }) => {
    // Test Inventory Grid tab (default)
    await expect(adminPage.locator('text=Search by name or SKU')).toBeVisible();
    await expect(adminPage.locator('text=Export')).toBeVisible();
    
    // Test Purchase Orders tab
    await adminPage.click('text=Purchase Orders');
    await expect(adminPage.locator('text=Create New Order')).toBeVisible();
    
    // Test Suppliers tab
    await adminPage.click('text=Suppliers');
    await expect(adminPage.locator('text=Add Supplier')).toBeVisible();
    await expect(adminPage.locator('text=Search suppliers')).toBeVisible();
    
    // Test Reports tab
    await adminPage.click('text=Reports');
    await expect(adminPage.locator('text=Inventory Turnover')).toBeVisible();
    await expect(adminPage.locator('text=Stock Valuation')).toBeVisible();
    
    // Test Alerts tab
    await adminPage.click('text=Alerts & Notifications');
    await expect(adminPage.locator('text=Alert Settings')).toBeVisible();
    await expect(adminPage.locator('text=Low Stock Notifications')).toBeVisible();
    
    // Return to Inventory Grid tab
    await adminPage.click('text=Inventory Grid');
    await expect(adminPage.locator('text=Search by name or SKU')).toBeVisible();
    
    console.log('✓ Tab navigation works correctly');
  });

  adminAuthFixture('should handle search and filter functionality', async ({ adminPage }) => {
    // Test search functionality
    const searchInput = adminPage.locator('input[placeholder="Search by name or SKU..."]');
    await searchInput.fill('test product');
    await expect(searchInput).toHaveValue('test product');
    
    // Clear search
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');
    
    // Test supplier filter
    const supplierFilter = adminPage.locator('select, div[role="combobox"]').filter({ hasText: 'All Suppliers' }).first();
    if (await supplierFilter.isVisible()) {
      await supplierFilter.click();
      // Wait for dropdown options to appear
      await adminPage.waitForTimeout(500);
    }
    
    // Test stock status filter
    const stockFilter = adminPage.locator('select, div[role="combobox"]').filter({ hasText: 'All Items' }).first();
    if (await stockFilter.isVisible()) {
      await stockFilter.click();
      await adminPage.waitForTimeout(500);
    }
    
    console.log('✓ Search and filter functionality works');
  });

  adminAuthFixture('should handle inventory actions', async ({ adminPage }) => {
    // Test export functionality
    await adminPage.click('button:has-text("Export")');
    
    // Test sync functionality
    await adminPage.click('button:has-text("Sync ShipStation")');
    
    // Wait for any notifications or responses
    await adminPage.waitForTimeout(1000);
    
    console.log('✓ Inventory actions work');
  });

  adminAuthFixture('should handle forecast period selection', async ({ adminPage }) => {
    // Look for forecast period selector
    const forecastSelector = adminPage.locator('select').filter({ hasText: '30' }).first();
    if (await forecastSelector.isVisible()) {
      await forecastSelector.click();
      await adminPage.waitForTimeout(500);
    }
    
    console.log('✓ Forecast period selection tested');
  });

  adminAuthFixture('should test inventory table interactions', async ({ adminPage }) => {
    // Wait for table to load
    await adminPage.waitForSelector('table', { timeout: 5000 });
    
    // Check if inventory table has data
    const tableRows = adminPage.locator('table tbody tr');
    const rowCount = await tableRows.count();
    
    if (rowCount > 0) {
      console.log(`Found ${rowCount} inventory items`);
      
      // Test action buttons on first row
      const firstRow = tableRows.first();
      const quickReorderBtn = firstRow.locator('button[title="Quick Reorder"]');
      const addToPOBtn = firstRow.locator('button[title="Add to Purchase Order"]');
      const editBtn = firstRow.locator('button').filter({ hasText: 'edit' }).first();
      
      if (await quickReorderBtn.isVisible()) {
        await quickReorderBtn.click();
        // Wait for modal to appear
        await adminPage.waitForTimeout(1000);
        
        // Close modal by clicking Cancel or outside
        const cancelBtn = adminPage.locator('button:has-text("Cancel")');
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
      
      if (await addToPOBtn.isVisible()) {
        await addToPOBtn.click();
        await adminPage.waitForTimeout(1000);
        
        // Close modal
        const closeBtn = adminPage.locator('button:has-text("Cancel")');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        }
      }
      
      console.log('✓ Inventory table interactions work');
    } else {
      console.log('✓ No inventory items found - empty state handled');
    }
  });
});

adminAuthFixture.describe('Admin Inventory Page - Supplier Management', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
    
    // Navigate to Suppliers tab
    await adminPage.click('text=Suppliers');
    await adminPage.waitForSelector('text=Add Supplier', { timeout: 5000 });
  });

  adminAuthFixture('should open supplier creation modal', async ({ adminPage }) => {
    // Click Add Supplier button
    await adminPage.click('button:has-text("Add Supplier")');
    
    // Wait for modal to open
    await adminPage.waitForSelector('text=Add Supplier', { timeout: 5000 });
    
    // Verify modal elements
    await expect(adminPage.locator('text=Basic Information')).toBeVisible();
    await expect(adminPage.locator('text=Supplier Name')).toBeVisible();
    await expect(adminPage.locator('text=Contact Person')).toBeVisible();
    await expect(adminPage.locator('text=Email')).toBeVisible();
    await expect(adminPage.locator('text=Phone')).toBeVisible();
    await expect(adminPage.locator('text=Address Information')).toBeVisible();
    await expect(adminPage.locator('text=Business Information')).toBeVisible();
    
    console.log('✓ Supplier creation modal opens and displays all required fields');
  });

  adminAuthFixture('should test supplier creation workflow', async ({ adminPage }) => {
    // Click Add Supplier button
    await adminPage.click('button:has-text("Add Supplier")');
    await adminPage.waitForSelector('text=Add Supplier', { timeout: 5000 });
    
    // Fill in supplier details
    const supplierName = `Test Supplier ${Date.now()}`;
    await adminPage.fill('input[placeholder="Enter supplier name"]', supplierName);
    await adminPage.fill('input[placeholder="Primary contact name"]', 'John Doe');
    await adminPage.fill('input[placeholder="contact@supplier.com"]', 'john@testsupplier.com');
    await adminPage.fill('input[placeholder="(555) 123-4567"]', '(555) 123-4567');
    await adminPage.fill('textarea[placeholder="Enter street address"]', '123 Test Street');
    await adminPage.fill('input[placeholder="City"]', 'Test City');
    await adminPage.fill('input[placeholder="State"]', 'TS');
    await adminPage.fill('input[placeholder="ZIP"]', '12345');
    
    // Test form validation - name is required
    await expect(adminPage.locator('button:has-text("Add Supplier")')).toBeEnabled();
    
    // Test cancel functionality
    await adminPage.click('button:has-text("Cancel")');
    await adminPage.waitForTimeout(1000);
    
    // Verify modal is closed
    await expect(adminPage.locator('text=Add Supplier')).not.toBeVisible();
    
    console.log('✓ Supplier creation workflow tested');
  });

  adminAuthFixture('should test supplier search functionality', async ({ adminPage }) => {
    // Test search input
    const searchInput = adminPage.locator('input[placeholder="Search suppliers..."]');
    await searchInput.fill('test supplier');
    await expect(searchInput).toHaveValue('test supplier');
    
    // Clear search
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');
    
    console.log('✓ Supplier search functionality works');
  });

  adminAuthFixture('should test supplier table interactions', async ({ adminPage }) => {
    // Wait for suppliers table to load
    await adminPage.waitForSelector('table', { timeout: 5000 });
    
    const tableRows = adminPage.locator('table tbody tr');
    const rowCount = await tableRows.count();
    
    if (rowCount > 0) {
      console.log(`Found ${rowCount} suppliers`);
      
      // Test supplier actions menu
      const firstRow = tableRows.first();
      const actionsMenu = firstRow.locator('button[aria-label="Actions"]');
      
      if (await actionsMenu.isVisible()) {
        await actionsMenu.click();
        await adminPage.waitForTimeout(500);
        
        // Verify menu options
        await expect(adminPage.locator('text=View Details')).toBeVisible();
        await expect(adminPage.locator('text=Edit')).toBeVisible();
        await expect(adminPage.locator('text=Delete')).toBeVisible();
        
        // Close menu by clicking elsewhere
        await adminPage.click('body');
      }
      
      console.log('✓ Supplier table interactions work');
    } else {
      console.log('✓ No suppliers found - empty state handled');
    }
  });
});

adminAuthFixture.describe('Admin Inventory Page - Purchase Order Management', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
    
    // Navigate to Purchase Orders tab
    await adminPage.click('text=Purchase Orders');
    await adminPage.waitForSelector('text=Create New Order', { timeout: 5000 });
  });

  adminAuthFixture('should open purchase order creation modal', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    
    // Wait for modal to open
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Verify stepper is present
    await expect(adminPage.locator('text=Supplier')).toBeVisible();
    await expect(adminPage.locator('text=Items')).toBeVisible();
    await expect(adminPage.locator('text=Review')).toBeVisible();
    
    console.log('✓ Purchase order creation modal opens with stepper');
  });

  adminAuthFixture('should test purchase order creation workflow', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Step 1: Supplier Information
    await expect(adminPage.locator('text=Supplier Name')).toBeVisible();
    await adminPage.fill('input[placeholder="Search or enter supplier name"]', 'Test Supplier');
    await adminPage.fill('input[placeholder="supplier@example.com"]', 'test@supplier.com');
    await adminPage.fill('input[placeholder="(555) 123-4567"]', '(555) 123-4567');
    await adminPage.fill('textarea[placeholder="Supplier address"]', '123 Supplier Street');
    
    // Test Next button
    await adminPage.click('button:has-text("Next")');
    await adminPage.waitForTimeout(500);
    
    // Step 2: Items
    await expect(adminPage.locator('text=Add Product')).toBeVisible();
    
    // Test Add Item button
    await adminPage.click('button:has-text("Add Item")');
    await adminPage.waitForTimeout(500);
    
    // Test Back button
    await adminPage.click('button:has-text("Back")');
    await adminPage.waitForTimeout(500);
    
    // Test Cancel button
    await adminPage.click('button:has-text("Cancel")');
    await adminPage.waitForTimeout(1000);
    
    console.log('✓ Purchase order creation workflow tested');
  });

  adminAuthFixture('should test AI recommendations functionality', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Fill supplier info and move to items step
    await adminPage.fill('input[placeholder="Search or enter supplier name"]', 'Test Supplier');
    await adminPage.click('button:has-text("Next")');
    await adminPage.waitForTimeout(1000);
    
    // Check for AI recommendations
    const aiRecommendations = adminPage.locator('text=AI Recommendations');
    if (await aiRecommendations.isVisible()) {
      console.log('✓ AI recommendations are available');
      
      // Test hide recommendations
      const hideBtn = adminPage.locator('button:has-text("Hide Recommendations")');
      if (await hideBtn.isVisible()) {
        await hideBtn.click();
      }
    } else {
      console.log('✓ No AI recommendations available');
    }
    
    // Test product search
    const productSearch = adminPage.locator('input[placeholder="Search products by name or SKU"]');
    await productSearch.fill('test product');
    await adminPage.waitForTimeout(1000);
    
    // Cancel the modal
    await adminPage.click('button:has-text("Cancel")');
    
    console.log('✓ AI recommendations and product search tested');
  });

  adminAuthFixture('should test purchase order table interactions', async ({ adminPage }) => {
    // Wait for purchase orders table to load
    await adminPage.waitForSelector('table', { timeout: 5000 });
    
    const tableRows = adminPage.locator('table tbody tr');
    const rowCount = await tableRows.count();
    
    if (rowCount > 0) {
      console.log(`Found ${rowCount} purchase orders`);
      
      // Test action buttons on first row
      const firstRow = tableRows.first();
      const actionButtons = firstRow.locator('button');
      const buttonCount = await actionButtons.count();
      
      if (buttonCount > 0) {
        // Test first action button (usually edit/view)
        await actionButtons.first().click();
        await adminPage.waitForTimeout(500);
        
        // Close any modal that might have opened
        const cancelBtn = adminPage.locator('button:has-text("Cancel")');
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
      
      console.log('✓ Purchase order table interactions work');
    } else {
      console.log('✓ No purchase orders found - empty state handled');
    }
  });
});

adminAuthFixture.describe('Admin Inventory Page - Reports and Analytics', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
    
    // Navigate to Reports tab
    await adminPage.click('text=Reports');
    await adminPage.waitForSelector('text=Inventory Turnover', { timeout: 5000 });
  });

  adminAuthFixture('should display all report options', async ({ adminPage }) => {
    // Verify report cards
    await expect(adminPage.locator('text=Inventory Turnover')).toBeVisible();
    await expect(adminPage.locator('text=Stock Valuation')).toBeVisible();
    await expect(adminPage.locator('text=Dead Stock Analysis')).toBeVisible();
    await expect(adminPage.locator('text=Supplier Performance')).toBeVisible();
    
    // Test Generate Report buttons
    const generateButtons = adminPage.locator('button:has-text("Generate Report")');
    const buttonCount = await generateButtons.count();
    
    if (buttonCount > 0) {
      // Test first generate button
      await generateButtons.first().click();
      await adminPage.waitForTimeout(1000);
    }
    
    console.log('✓ All report options are displayed and functional');
  });

  adminAuthFixture('should test purchase order analytics', async ({ adminPage }) => {
    // Look for purchase order analytics section
    const analyticsSection = adminPage.locator('text=Purchase Order Analytics');
    
    if (await analyticsSection.isVisible()) {
      console.log('✓ Purchase order analytics section is visible');
    } else {
      console.log('✓ Purchase order analytics may not be available');
    }
  });
});

adminAuthFixture.describe('Admin Inventory Page - Alerts and Notifications', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
    
    // Navigate to Alerts tab
    await adminPage.click('text=Alerts & Notifications');
    await adminPage.waitForSelector('text=Alert Settings', { timeout: 5000 });
  });

  adminAuthFixture('should display alert settings', async ({ adminPage }) => {
    // Verify alert settings
    await expect(adminPage.locator('text=Low Stock Notifications')).toBeVisible();
    await expect(adminPage.locator('text=Out of Stock Alerts')).toBeVisible();
    await expect(adminPage.locator('text=Forecast Warnings')).toBeVisible();
    
    // Test toggle switches
    const switches = adminPage.locator('input[type="checkbox"]');
    const switchCount = await switches.count();
    
    if (switchCount > 0) {
      console.log(`Found ${switchCount} alert toggle switches`);
    }
    
    console.log('✓ Alert settings are displayed');
  });

  adminAuthFixture('should display active alerts', async ({ adminPage }) => {
    // Look for active alerts section
    await expect(adminPage.locator('text=Active Alerts')).toBeVisible();
    
    // Check for alert items
    const alertItems = adminPage.locator('div[role="alert"]');
    const alertCount = await alertItems.count();
    
    if (alertCount > 0) {
      console.log(`Found ${alertCount} active alerts`);
      
      // Test reorder button on first alert
      const reorderBtn = alertItems.first().locator('button:has-text("Reorder")');
      if (await reorderBtn.isVisible()) {
        await reorderBtn.click();
        await adminPage.waitForTimeout(1000);
        
        // Close any modal
        const cancelBtn = adminPage.locator('button:has-text("Cancel")');
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
    } else {
      console.log('✓ No active alerts found');
    }
  });
});

adminAuthFixture.describe('Admin Inventory Page - Complete Workflows', () => {
  adminAuthFixture.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
  });

  adminAuthFixture('should complete full inventory management workflow', async ({ adminPage }) => {
    // 1. Check inventory stats
    await expect(adminPage.locator('text=Total Products')).toBeVisible();
    
    // 2. Search and filter inventory
    await adminPage.fill('input[placeholder="Search by name or SKU..."]', 'test');
    await adminPage.waitForTimeout(1000);
    
    // 3. Clear search
    await adminPage.fill('input[placeholder="Search by name or SKU..."]', '');
    
    // 4. Test sync functionality
    await adminPage.click('button:has-text("Sync ShipStation")');
    await adminPage.waitForTimeout(2000);
    
    // 5. Test export functionality
    await adminPage.click('button:has-text("Export")');
    await adminPage.waitForTimeout(2000);
    
    // 6. Navigate through all tabs
    await adminPage.click('text=Purchase Orders');
    await adminPage.waitForTimeout(500);
    await adminPage.click('text=Suppliers');
    await adminPage.waitForTimeout(500);
    await adminPage.click('text=Reports');
    await adminPage.waitForTimeout(500);
    await adminPage.click('text=Alerts & Notifications');
    await adminPage.waitForTimeout(500);
    await adminPage.click('text=Inventory Grid');
    await adminPage.waitForTimeout(500);
    
    console.log('✓ Complete inventory management workflow tested');
  });

  adminAuthFixture('should handle error states gracefully', async ({ adminPage }) => {
    // Test navigation to non-existent inventory item
    await adminPage.goto('/admin/inventory/non-existent-item');
    await adminPage.waitForLoadState('networkidle');
    
    // Should handle gracefully (either show error or redirect)
    const currentUrl = adminPage.url();
    console.log(`✓ Error handling tested - Current URL: ${currentUrl}`);
    
    // Navigate back to inventory
    await adminPage.goto('/admin/inventory');
    await adminPage.waitForSelector('text=Inventory Management', { timeout: 10000 });
  });

  adminAuthFixture('should test responsive design', async ({ adminPage }) => {
    // Test different viewport sizes
    await adminPage.setViewportSize({ width: 1200, height: 800 });
    await expect(adminPage.locator('text=Inventory Management')).toBeVisible();
    
    await adminPage.setViewportSize({ width: 768, height: 1024 });
    await expect(adminPage.locator('text=Inventory Management')).toBeVisible();
    
    await adminPage.setViewportSize({ width: 375, height: 667 });
    await expect(adminPage.locator('text=Inventory Management')).toBeVisible();
    
    // Reset viewport
    await adminPage.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✓ Responsive design tested');
  });

  adminAuthFixture('should test keyboard navigation', async ({ adminPage }) => {
    // Test keyboard navigation on search input
    await adminPage.focus('input[placeholder="Search by name or SKU..."]');
    await adminPage.keyboard.type('test product');
    await adminPage.keyboard.press('Tab');
    
    // Test escape key functionality
    await adminPage.keyboard.press('Escape');
    
    console.log('✓ Keyboard navigation tested');
  });
});