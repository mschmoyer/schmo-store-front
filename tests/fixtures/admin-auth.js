const { test: base } = require('@playwright/test');

/**
 * Admin authentication fixture
 * Provides a logged-in admin user for tests
 */
const adminAuthFixture = base.extend({
  /**
   * Automatically logs in as admin before each test
   */
  adminPage: async ({ page }, use) => {
    // Navigate to admin login page
    await page.goto('/admin/login');
    
    // Wait for and fill in login credentials
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', 'mikeschmoyer+test3@gmail.com');
    await page.fill('input[type="password"]', 'warhammer');
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for successful login redirect to admin dashboard
    await page.waitForURL('/admin');
    
    // Verify we're logged in by checking for admin navigation
    await page.waitForSelector('text=Admin Dashboard');
    
    // Use the authenticated page
    await use(page);
  }
});

module.exports = { adminAuthFixture };