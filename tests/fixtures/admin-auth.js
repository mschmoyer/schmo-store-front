const { test: base } = require('@playwright/test');

/**
 * Admin authentication fixture.
 *
 * Provides a logged-in admin page to any spec that needs one.
 *
 * This fixture had been broken since v1.1.0 and took every admin e2e suite
 * down with it, in two ways:
 *
 * 1. It signed in as `mikeschmoyer+test3@gmail.com`, a user that does not
 *    exist in any seeded database. Every login failed, so every test in
 *    `admin-coupons`, `admin-inventory`, `admin-navigation` and
 *    `admin-products` failed in `beforeEach` rather than on an assertion —
 *    which is why the suites reported nothing useful about the pages they
 *    were meant to be covering.
 * 2. It waited for the text `Admin Dashboard`, which the nav has not rendered
 *    since the sidebar was regrouped; the item reads `Dashboard`.
 *
 * It now uses the seeded demo merchant and waits for the dashboard heading the
 * page actually renders. Credentials are overridable so a spec can drive a
 * different store.
 */

const DEFAULT_EMAIL = process.env.E2E_ADMIN_EMAIL || 'demo@schmostore.com';
const DEFAULT_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'rebeldev';

const adminAuthFixture = base.extend({
  /**
   * A page already signed in to the admin.
   *
   * Signs in through the real login form rather than injecting a token, so the
   * fixture also exercises the auth path every merchant uses.
   */
  adminPage: async ({ page }, use) => {
    await page.goto('/login');

    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', DEFAULT_EMAIL);
    await page.fill('input[type="password"]', DEFAULT_PASSWORD);
    await page.click('button[type="submit"]');

    // The redirect lands on /admin; wait for the shell, not just the URL, so a
    // spec never starts asserting against a half-rendered page.
    await page.waitForURL(/\/admin(\?.*)?$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 20000 });

    await use(page);
  },
});

module.exports = { adminAuthFixture };
