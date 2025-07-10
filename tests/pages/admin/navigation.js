/**
 * Admin Navigation Page Object Model
 * Contains selectors and methods for interacting with the admin navigation
 */
class AdminNavigation {
  constructor(page) {
    this.page = page;
    
    // Navigation items based on AdminNav.tsx
    this.navItems = [
      { label: 'Dashboard', href: '/admin', selector: 'text=Dashboard' },
      { label: 'Products', href: '/admin/products', selector: 'text=Products' },
      { label: 'Inventory', href: '/admin/inventory', selector: 'text=Inventory' },
      { label: 'Coupons & Discounts', href: '/admin/coupons', selector: 'text=Coupons & Discounts' },
      { label: 'AI Assistant', href: '/admin/ai', selector: 'text=AI Assistant' },
      { label: 'Integrations', href: '/admin/integrations', selector: 'text=Integrations' },
      { label: 'Page Design', href: '/admin/design', selector: 'text=Page Design' },
      { label: 'Blog', href: '/admin/blog', selector: 'text=Blog' },
      { label: 'Analytics', href: '/admin/analytics', selector: 'text=Analytics' }
    ];
    
    // Selectors
    this.adminDashboardText = 'text=Admin Dashboard';
    this.logoutButton = 'text=Logout';
    this.viewStoreButton = 'text=View Store';
  }

  /**
   * Wait for admin navigation to be visible
   */
  async waitForNavigation() {
    await this.page.waitForSelector(this.adminDashboardText);
  }

  /**
   * Click on a navigation item by label
   */
  async clickNavItem(label) {
    const navItem = this.navItems.find(item => item.label === label);
    if (!navItem) {
      throw new Error(`Navigation item '${label}' not found`);
    }
    
    await this.page.click(navItem.selector);
    await this.page.waitForURL(navItem.href, { timeout: 15000 });
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
    await this.page.waitForURL('/admin/login');
  }
}

module.exports = { AdminNavigation };