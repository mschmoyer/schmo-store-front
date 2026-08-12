/**
 * Admin Navigation Page Object Model
 * Contains selectors and methods for interacting with the admin navigation
 */
class AdminNavigation {
  constructor(page) {
    this.page = page;
    
    /*
     * The nav's enabled items, in the order AdminNav.tsx renders them.
     *
     * This list has to track the sidebar, and the sidebar changed: **Orders**
     * was added (the largest gap in the product — 27 orders and 51 tracking
     * numbers with no screen to show them), while **Coupons & Discounts**,
     * **Purchase Orders** and **AI Assistant** were removed as top-level items.
     * Their routes still work and are reached from the page they belong to —
     * coupons from Products, purchase orders from the Inventory tab — but they
     * no longer spend a nav slot on a merchant who has ten minutes.
     *
     * Selectors are role-based links rather than bare `text=`, because
     * `text=Products` also matches the "Total products" stat card and
     * `text=Blog` matches "Blog posts".
     */
    this.navItems = [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Analytics', href: '/admin/analytics' },
      { label: 'Products', href: '/admin/products' },
      { label: 'Inventory', href: '/admin/inventory' },
      { label: 'Page Design', href: '/admin/design' },
      { label: 'Blog', href: '/admin/blog' },
      { label: 'Integrations', href: '/admin/integrations' },
      { label: 'Billing', href: '/admin/billing' },
    ];

    // The shell used to be detected by `text=Admin Dashboard`, which the nav
    // has not rendered since it was regrouped; the item reads `Dashboard`.
    this.dashboardHeading = 'h1:has-text("Dashboard")';
    this.logoutButton = 'text=Sign out';
    this.viewStoreButton = 'text=View store';
  }

  /**
   * Wait for admin navigation to be visible
   */
  async waitForNavigation() {
    await this.page.waitForSelector('nav, [class*="nav"]', { timeout: 20000 });
    await this.page.getByRole('link', { name: 'Dashboard', exact: true }).waitFor({ timeout: 20000 });
  }

  /**
   * Click on a navigation item by label
   */
  async clickNavItem(label) {
    const navItem = this.navItems.find(item => item.label === label);
    if (!navItem) {
      throw new Error(`Navigation item '${label}' not found`);
    }
    
    await this.page.getByRole('link', { name: navItem.label, exact: true }).first().click();
    await this.page.waitForURL(`**${navItem.href}`, { timeout: 20000 });
  }

  /**
   * Get all enabled navigation items
   */
  getEnabledNavItems() {
    return this.navItems;
  }

  /**
   * Visit all navigation pages and verify they load
   */
  async visitAllPages() {
    const results = [];
    
    for (const navItem of this.navItems) {
      try {
        console.log(`Visiting ${navItem.label} (${navItem.href})`);
        
        // Click navigation item
        await this.clickNavItem(navItem.label);
        
        // Wait for page to load
        await this.page.waitForLoadState('networkidle');
        
        // Check if page loaded successfully (no 404 or error)
        const title = await this.page.title();
        const hasError = await this.page.locator('text=404').isVisible().catch(() => false);
        
        results.push({
          page: navItem.label,
          href: navItem.href,
          success: !hasError,
          title: title,
          error: hasError ? 'Page not found (404)' : null
        });
        
        console.log(`✓ ${navItem.label} loaded successfully`);
        
      } catch (error) {
        console.error(`✗ Failed to load ${navItem.label}:`, error.message);
        results.push({
          page: navItem.label,
          href: navItem.href,
          success: false,
          title: null,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Check if currently on admin dashboard
   */
  async isOnDashboard() {
    return await this.page.url().endsWith('/admin');
  }

  /**
   * Click logout button
   */
  async logout() {
    await this.page.click(this.logoutButton);
    // The sign-in route is `/login`, not `/admin/login`.
    await this.page.waitForURL('**/login', { timeout: 20000 });
  }
}

module.exports = { AdminNavigation };