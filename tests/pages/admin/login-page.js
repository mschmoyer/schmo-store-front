/**
 * Admin Login Page Object Model
 * Contains selectors and methods for interacting with the admin login page
 */
class AdminLoginPage {
  constructor(page) {
    this.page = page;
    
    // Selectors
    this.emailInput = 'input[type="email"]';
    this.passwordInput = 'input[type="password"]';
    this.submitButton = 'button[type="submit"]';
    this.errorMessage = '[data-testid="error-message"]';
    this.loginForm = 'form';
  }

  /**
   * Navigate to admin login page
   */
  async goto() {
    await this.page.goto('/admin/login');
  }

  /**
   * Fill in email field
   */
  async fillEmail(email) {
    await this.page.fill(this.emailInput, email);
  }

  /**
   * Fill in password field
   */
  async fillPassword(password) {
    await this.page.fill(this.passwordInput, password);
  }

  /**
   * Click submit button
   */
  async submit() {
    await this.page.click(this.submitButton);
  }

  /**
   * Complete login process
   */
  async login(email, password) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  /**
   * Wait for login to complete and redirect to admin dashboard
   */
  async waitForLoginSuccess() {
    await this.page.waitForURL('/admin');
    await this.page.waitForSelector('text=Admin Dashboard');
  }

  /**
   * Get error message if login fails
   */
  async getErrorMessage() {
    return await this.page.textContent(this.errorMessage);
  }
}

module.exports = { AdminLoginPage };