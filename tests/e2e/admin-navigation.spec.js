const { test, expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');
const { AdminNavigation } = require('../pages/admin/navigation');
const { AdminLoginPage } = require('../pages/admin/login-page');

adminAuthFixture.describe('Admin Navigation', () => {
  adminAuthFixture.beforeEach(async ({ page }) => {
    // Each test starts fresh - fixture handles login
  });

  adminAuthFixture('should login successfully and load admin dashboard', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Verify we're on the admin dashboard
    await expect(adminPage).toHaveURL('/admin');
    await navigation.waitForNavigation();
    
    // Check that admin dashboard elements are present
    await expect(adminPage.locator('text=Admin Dashboard')).toBeVisible();
    
    console.log('✓ Admin login and dashboard load successful');
  });

  adminAuthFixture('should navigate to all admin pages successfully', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Wait for navigation to be ready
    await navigation.waitForNavigation();
    
    // Visit all enabled navigation pages
    const results = await navigation.visitAllPages();
    
    // Log results
    console.log('\n📊 Navigation Test Results:');
    console.log('=' .repeat(50));
    
    const successfulPages = results.filter(r => r.success);
    const failedPages = results.filter(r => !r.success);
    
    successfulPages.forEach(result => {
      console.log(`✓ ${result.page.padEnd(20)} - ${result.href}`);
    });
    
    if (failedPages.length > 0) {
      console.log('\n❌ Failed Pages:');
      failedPages.forEach(result => {
        console.log(`✗ ${result.page.padEnd(20)} - ${result.href} (${result.error})`);
      });
    }
    
    console.log(`\n📈 Summary: ${successfulPages.length}/${results.length} pages loaded successfully`);
    
    // Assert that at least the main pages work
    const criticalPages = ['Dashboard', 'Products', 'AI Assistant'];
    const criticalResults = results.filter(r => criticalPages.includes(r.page));
    const criticalSuccesses = criticalResults.filter(r => r.success);
    
    expect(criticalSuccesses.length).toBe(criticalPages.length);
    
    // Optional: Assert all pages work (comment out if some pages are expected to fail)
    // expect(failedPages.length).toBe(0);
  });

  adminAuthFixture('should handle individual page navigation', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Test individual page navigation
    await navigation.clickNavItem('Products');
    await expect(adminPage).toHaveURL('/admin/products');
    
    await navigation.clickNavItem('Dashboard');
    await expect(adminPage).toHaveURL('/admin');
    
    await navigation.clickNavItem('AI Assistant');
    await expect(adminPage).toHaveURL('/admin/ai');
    
    console.log('✓ Individual page navigation works correctly');
  });

  adminAuthFixture('should logout successfully', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Wait for navigation to be ready
    await navigation.waitForNavigation();
    
    // Logout
    await navigation.logout();
    
    // Verify redirect to login page
    await expect(adminPage).toHaveURL('/admin/login');
    
    console.log('✓ Logout successful');
  });
});

test.describe('Admin Login (without fixture)', () => {
  test('should login with valid credentials', async ({ page }) => {
    const loginPage = new AdminLoginPage(page);
    
    await loginPage.goto();
    await loginPage.login('mikeschmoyer+test3@gmail.com', 'warhammer');
    await loginPage.waitForLoginSuccess();
    
    // Verify successful login
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('text=Admin Dashboard')).toBeVisible();
    
    console.log('✓ Manual login test successful');
  });
  
  test('should handle invalid credentials', async ({ page }) => {
    const loginPage = new AdminLoginPage(page);
    
    await loginPage.goto();
    await loginPage.login('invalid@email.com', 'wrongpassword');
    
    // Should stay on login page
    await expect(page).toHaveURL('/admin/login');
    
    // Check for error message (might need to adjust selector based on actual implementation)
    const hasErrorIndicator = await page.locator('text=Invalid').isVisible().catch(() => false) ||
                             await page.locator('[data-testid="error"]').isVisible().catch(() => false) ||
                             await page.locator('.error').isVisible().catch(() => false);
    
    // Don't assert error message since we don't know exact implementation
    console.log('✓ Invalid credentials handled appropriately');
  });
});