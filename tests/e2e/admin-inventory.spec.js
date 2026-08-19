const { expect } = require('@playwright/test');
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
    await adminPage.waitForLoadState('networkidle');
  });

  adminAuthFixture('should load inventory page with all key elements', async ({ adminPage }) => {
    // Verify page title and description
    await expect(adminPage.locator('h1')).toContainText('Inventory');

    /*
     * Stat tiles. Two things changed here beyond casing:
     *
     * - "Total value" is now $22,275.99, the real figure. It read $77,755.47 —
     *   inflated 249% by a `LEFT JOIN inventory_logs` fan-out that also
     *   reported 45 products where there are 12. It now agrees with the
     *   valuation report and the Products page.
     * - "Pending orders / Awaiting delivery" is now "Customer orders to ship".
     *   The count was always customer orders in pending/processing, but the
     *   label read as inbound restocks — so five customers who had been waiting
     *   two months looked like five deliveries on their way.
     */
    // `.first()` throughout: several of these words also appear as table
    // column headers, and an unscoped getByText is a strict-mode violation
    // rather than a failure of the page.
    await expect(adminPage.getByText('Total products').first()).toBeVisible();
    await expect(adminPage.getByText('Total value').first()).toBeVisible();
    await expect(adminPage.getByText('$22,275').first()).toBeVisible();
    await expect(adminPage.getByText('Low stock', { exact: true }).first()).toBeVisible();
    await expect(adminPage.getByText('Out of stock', { exact: true }).first()).toBeVisible();
    await expect(adminPage.getByText('Customer orders to ship')).toBeVisible();
    await expect(adminPage.getByText('Restocked').first()).toBeVisible();
    
    // Verify sync button
    await expect(adminPage.locator('button:has-text("Sync ShipStation")')).toBeVisible();
    
    // Verify tabs
    // Tabs by role. A bare `text=Purchase Orders` also matches the panel's own
    // <h3>, which is a strict-mode violation rather than a real failure.
    for (const tab of ['Inventory Grid', 'Purchase Orders', 'Suppliers', 'Reports', 'Alerts & Notifications']) {
      await expect(adminPage.getByRole('tab', { name: tab })).toBeVisible();
    }
    
    console.log('✓ Inventory page loaded with all key elements');
  });

  adminAuthFixture('should handle tab navigation', async ({ adminPage }) => {
    // Test Inventory Grid tab (default)
    await expect(adminPage.getByPlaceholder('Search by name or SKU...')).toBeVisible();
    await expect(adminPage.locator('text=Export')).toBeVisible();
    
    // Test Purchase Orders tab
    await adminPage.getByRole('tab', { name: 'Purchase Orders' }).click();
    await expect(adminPage.locator('text=Create New Order').first()).toBeVisible();
    
    // Test Suppliers tab
    await adminPage.getByRole('tab', { name: 'Suppliers' }).click();
    await expect(adminPage.locator('text=Add Supplier').first()).toBeVisible();
    await expect(adminPage.getByPlaceholder('Search suppliers...')).toBeVisible();
    
    // Test Reports tab
    await adminPage.getByRole('tab', { name: 'Reports' }).click();
    await expect(adminPage.locator('text=Inventory Turnover')).toBeVisible();
    await expect(adminPage.locator('text=Stock Valuation')).toBeVisible();
    
    // Test Alerts tab
    await adminPage.getByRole('tab', { name: 'Alerts & Notifications' }).click();
    await expect(adminPage.locator('text=Alert Settings').first()).toBeVisible();
    await expect(adminPage.locator('text=Low Stock Notifications').first()).toBeVisible();
    
    // Return to Inventory Grid tab
    await adminPage.getByRole('tab', { name: 'Inventory Grid' }).click();
    await expect(adminPage.getByPlaceholder('Search by name or SKU...')).toBeVisible();
    
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
    
    // Navigate to Suppliers tab
    await adminPage.getByRole('tab', { name: 'Suppliers' }).click();
    await adminPage.waitForSelector('text=Add Supplier', { timeout: 5000 });
  });

  adminAuthFixture('should open supplier creation modal', async ({ adminPage }) => {
    // Click Add Supplier button
    await adminPage.click('button:has-text("Add Supplier")');
    
    // Wait for modal to open
    await adminPage.waitForSelector('text=Add Supplier', { timeout: 5000 });
    
    // Verify modal elements. Scoped to the dialog and matched by field rather
    // than by loose text: "Email" and "Phone" each appear on both a label and
    // a column header, which is a strict-mode violation, not a page fault.
    const modal = adminPage.getByRole('dialog');
    await expect(modal.getByText('Basic Information')).toBeVisible();
    await expect(modal.getByPlaceholder('Enter supplier name')).toBeVisible();
    await expect(modal.getByPlaceholder('Primary contact name')).toBeVisible();
    await expect(modal.getByPlaceholder('contact@supplier.com')).toBeVisible();
    await expect(modal.getByPlaceholder('(555) 123-4567')).toBeVisible();
    await expect(modal.getByText('Address Information')).toBeVisible();
    await expect(modal.getByText('Business Information')).toBeVisible();
    
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
    await expect(adminPage.locator('button:has-text("Add Supplier")').first()).toBeEnabled();
    
    // Test cancel functionality
    await adminPage.getByRole('button', { name: 'Cancel' }).click();

    // The dialog closes. Asserting on `text=Add Supplier` cannot work — the
    // button that opens the modal carries the same words and stays on screen.
    await expect(adminPage.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });
    
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
    /*
     * The seeded store has no suppliers, so there is no table to wait for —
     * the tab renders its empty state instead. Waiting unconditionally on
     * `table` made this fail on an absence that is the correct behaviour.
     */
    const tableRows = adminPage.locator('table tbody tr');
    const rowCount = await adminPage
      .locator('table')
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => tableRows.count())
      .catch(() => 0);

    if (rowCount === 0) {
      console.log('No suppliers on this store; empty state is the expected view');
    }
    
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
    
    // Navigate to Purchase Orders tab
    await adminPage.getByRole('tab', { name: 'Purchase Orders' }).click();
    await adminPage.waitForSelector('text=Create New Order', { timeout: 5000 });
  });

  adminAuthFixture('should open purchase order creation modal', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    
    // Wait for modal to open
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Verify the stepper. Scoped to the dialog and matched on the step
    // control: bare `text=Supplier` matches eleven elements on this page.
    const modal = adminPage.getByRole('dialog');
    for (const step of ['Supplier', 'Items', 'Review']) {
      await expect(modal.getByText(step, { exact: true }).first()).toBeVisible();
    }
    
    console.log('✓ Purchase order creation modal opens with stepper');
  });

  adminAuthFixture('should test purchase order creation workflow', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Step 1: Supplier Information
    await expect(adminPage.locator('text=Supplier Name').first()).toBeVisible();
    await adminPage.fill('input[placeholder="Search or enter supplier name"]', 'Test Supplier');
    await adminPage.fill('input[placeholder="supplier@example.com"]', 'test@supplier.com');
    await adminPage.fill('input[placeholder="(555) 123-4567"]', '(555) 123-4567');
    await adminPage.fill('textarea[placeholder="Supplier address"]', '123 Supplier Street');
    
    // Test Next button
    await adminPage.click('button:has-text("Next")');
    await adminPage.waitForTimeout(500);
    
    // Step 2: Items
    await expect(adminPage.getByRole('dialog').getByText('Add Product').first()).toBeVisible();
    
    // Test Back button
    await adminPage.getByRole('button', { name: 'Back' }).first().click();
    await adminPage.waitForTimeout(500);

    // Test Cancel button
    await adminPage.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(adminPage.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });
    
    console.log('✓ Purchase order creation workflow tested');
  });

  adminAuthFixture('should test AI recommendations functionality', async ({ adminPage }) => {
    // Click Create New Order button
    await adminPage.click('button:has-text("Create New Order")');
    await adminPage.waitForSelector('text=Create Purchase Order', { timeout: 5000 });
    
    // Fill supplier info and move to items step
    await adminPage.fill('input[placeholder="Search or enter supplier name"]', 'Test Supplier');
    await adminPage.getByRole('button', { name: 'Next' }).first().click();
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
    
    /*
     * Step back, then cancel. Step 2 of the stepper offers Back and Next only
     * — Cancel lives on step 1 — so waiting for Cancel here timed the test out
     * on a button that is correctly absent, and the modal does not close on
     * Escape either. This is the path a user actually has.
     */
    await adminPage.getByRole('button', { name: 'Back' }).first().click();
    await adminPage.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(adminPage.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });

    console.log('✓ AI recommendations and product search tested');
  });

  adminAuthFixture('should test purchase order table interactions', async ({ adminPage }) => {
    /*
     * This store has no purchase orders, so the tab renders its empty state
     * and there is no table to wait for. That is now the honest view: the
     * list page used to render three hardcoded orders from January 2024
     * whether or not any existed.
     */
    const hasTable = await adminPage
      .locator('table')
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!hasTable) {
      console.log('No purchase orders on this store; empty state is the expected view');
      return;
    }
    
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
    
    // Navigate to Reports tab
    await adminPage.getByRole('tab', { name: 'Reports' }).click();
    await adminPage.waitForSelector('text=Inventory Turnover', { timeout: 5000 });
  });

  adminAuthFixture('should display all report options', async ({ adminPage }) => {
    // Verify report cards
    await expect(adminPage.locator('text=Inventory Turnover')).toBeVisible();
    await expect(adminPage.locator('text=Stock Valuation')).toBeVisible();

    // Dead Stock Analysis is back: its component and API both worked all along
    // and it was commented out of the report router in one line.
    await expect(adminPage.locator('text=Dead Stock Analysis')).toBeVisible();

    // Supplier Performance is gone. It had a title and a "Generate Report"
    // button and neither a component nor an API, so the button bounced the
    // merchant silently back to this page.
    await expect(adminPage.locator('text=Supplier Performance')).toHaveCount(0);
    
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
    
    // Navigate to Alerts tab
    await adminPage.getByRole('tab', { name: 'Alerts & Notifications' }).click();
    await adminPage.waitForSelector('text=Alert Settings', { timeout: 5000 });
  });

  adminAuthFixture('should display alert settings', async ({ adminPage }) => {
    // Verify alert settings
    await expect(adminPage.locator('text=Low Stock Notifications').first()).toBeVisible();
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
  });

  adminAuthFixture('should complete full inventory management workflow', async ({ adminPage }) => {
    // 1. Check inventory stats
    await expect(adminPage.getByText('Total products').first()).toBeVisible();
    
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
    await adminPage.getByRole('tab', { name: 'Purchase Orders' }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.getByRole('tab', { name: 'Suppliers' }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.getByRole('tab', { name: 'Reports' }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.getByRole('tab', { name: 'Alerts & Notifications' }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.getByRole('tab', { name: 'Inventory Grid' }).click();
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
    // The heading is `Inventory`, not `Inventory Management`. Every test in
    // this file was failing here rather than on an assertion.
    await adminPage.waitForSelector('h1:has-text("Inventory")', { timeout: 20000 });
  });

  adminAuthFixture('should test responsive design', async ({ adminPage }) => {
    // Test different viewport sizes
    await adminPage.setViewportSize({ width: 1200, height: 800 });
    await expect(adminPage.locator('h1')).toContainText('Inventory');
    
    await adminPage.setViewportSize({ width: 768, height: 1024 });
    await expect(adminPage.locator('h1')).toContainText('Inventory');
    
    await adminPage.setViewportSize({ width: 375, height: 667 });
    await expect(adminPage.locator('h1')).toContainText('Inventory');
    
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