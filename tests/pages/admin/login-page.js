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
    // `/login` is now the identity provider's door and renders no form of its own — a labelled
    // "not configured" state in an environment with no Clerk keys, which is what CI and the dev
    // container are. The email/password form this page object drives lives at `/native-login`.
    await this.page.goto('/native-login');
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
    await this.page.waitForURL(/\/admin(\?.*)?$/, { timeout: 20000 });
    // `Admin Dashboard` is not text the app renders; the heading is `Dashboard`.
    await this.page.waitForSelector('h1:has-text("Dashboard")', { timeout: 20000 });
  }

  /**
   * Get error message if login fails
   */
  async getErrorMessage() {
    return await this.page.textContent(this.errorMessage);
  }
}

module.exports = { AdminLoginPage };