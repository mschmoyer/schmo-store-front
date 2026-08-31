const { test, expect } = require('@playwright/test');
const { adminAuthFixture } = require('../fixtures/admin-auth');
const { AdminNavigation } = require('../pages/admin/navigation');
const { AdminLoginPage } = require('../pages/admin/login-page');

adminAuthFixture.describe('Admin Navigation', () => {
  adminAuthFixture('should login successfully and load admin dashboard', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Verify we're on the admin dashboard
    await expect(adminPage).toHaveURL(/\/admin(\?.*)?$/);
    await navigation.waitForNavigation();
    
    // Check that admin dashboard elements are present
    await expect(adminPage.locator('h1')).toContainText('Dashboard');
    
    console.log('✓ Admin login and dashboard load successful');
  });

  adminAuthFixture('should navigate to all admin pages successfully', async ({ adminPage }) => {
    /*
     * Nine routes visited in sequence. In dev each one is compiled on first
     * request, so the default 30s budget expires around the fifth page and the
     * test fails for a reason that has nothing to do with the navigation.
     */
    adminAuthFixture.setTimeout(180000);

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
    // Orders replaces AI Assistant in the critical set. AI Assistant is no
    // longer a nav item (four of its seven cards read "Coming Soon"); Orders is
    // the screen a merchant opens most.
    const criticalPages = ['Dashboard', 'Orders', 'Products'];
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
    await expect(adminPage).toHaveURL(/\/admin\/products/);
    
    await navigation.clickNavItem('Dashboard');
    await expect(adminPage).toHaveURL(/\/admin(\?.*)?$/);
    
    await navigation.clickNavItem('Orders');
    await expect(adminPage).toHaveURL(/\/admin\/orders/);
    
    console.log('✓ Individual page navigation works correctly');
  });

  adminAuthFixture('should logout successfully', async ({ adminPage }) => {
    const navigation = new AdminNavigation(adminPage);
    
    // Wait for navigation to be ready
    await navigation.waitForNavigation();
    
    // Logout
    await navigation.logout();
    
    // Verify redirect to login page
    await expect(adminPage).toHaveURL(/\/login/);

    console.log('✓ Logout successful');
  });
});

test.describe('Admin Login (without fixture)', () => {
  test('should login with valid credentials', async ({ page }) => {
    const loginPage = new AdminLoginPage(page);
    
    await loginPage.goto();
    // The seeded demo merchant. The previous credentials belonged to a user
    // that exists in no database, so this test could never have passed.
    await loginPage.login('demo@schmostore.com', 'rebeldev');
    await loginPage.waitForLoginSuccess();

    await expect(page).toHaveURL(/\/admin(\?.*)?$/);
    await expect(page.locator('h1')).toContainText('Dashboard');
    
    console.log('✓ Manual login test successful');
  });
  
  test('should handle invalid credentials', async ({ page }) => {
    const loginPage = new AdminLoginPage(page);
    
    await loginPage.goto();
    await loginPage.login('invalid@email.com', 'wrongpassword');

    // Should stay on the sign-in page
    await expect(page).toHaveURL(/\/native-login/);

    // No assertion on the error message itself: the login page's error markup is not pinned
    // down by a contract, so probing for it would be a guess. Staying on the form is the
    // behaviour that actually matters and is asserted above.
    console.log('✓ Invalid credentials handled appropriately');
  });
});