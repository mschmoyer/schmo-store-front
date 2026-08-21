/**
 * The platform-operator door in the merchant sidebar.
 *
 * Two things are under test and they are not the same thing:
 *
 * 1. **The link.** `users.is_admin` reaches the merchant shell through
 *    `/api/admin/auth/verify` (a fresh database read on every verify, never the JWT) and
 *    `AdminContext`, and `AdminNav` draws an "Admin" item in the sidebar footer when it is set.
 * 2. **The refusal.** Not drawing the link is *not* access control. `/platform` and every
 *    `/api/platform/*` route re-check `users.is_admin` server-side, so a merchant who types the
 *    URL gets refused rather than served another tenant's data. That is asserted here as a
 *    negative — no cross-tenant store name on the page — rather than against a copy string this
 *    spec invented, because the `/platform` page is owned elsewhere and its wording is not a
 *    contract.
 *
 * Sign-in is done inline rather than through `../fixtures/admin-auth`: that fixture exists to hand
 * a spec one already-signed-in demo merchant, and this spec needs two different users in the same
 * run. The flow it performs is the same one — the real login form, not an injected token.
 */

import { test, expect, type Page } from '@playwright/test';

/** The seeded merchant that `scripts/grant-admin.js` has flagged as a platform operator. */
const PLATFORM_ADMIN = { email: 'demo@schmostore.com', password: 'rebeldev' };

/** A seeded merchant who owns a store and is *not* a platform operator. */
const MERCHANT = { email: 'store.owner@example.com', password: 'rebeldev' };

/**
 * Seeded store names belonging to tenants other than {@link MERCHANT}'s own (Fernwood Goods).
 * Any of these appearing on a page the non-admin merchant loaded is a cross-tenant leak.
 */
const OTHER_TENANT_STORE_NAMES = ['Basecamp Audio', 'Ironline Fitness'];

/** Wording a refusal page might plausibly use, in any of its likely forms. */
const REFUSAL_PATTERN = /403|forbidden|not authori|unauthori|access denied|no access|permission|admin only|sign in/i;

/**
 * Sign in through the real login form and wait for the merchant shell to render.
 *
 * @param page - The Playwright page to drive.
 * @param credentials - Email and password of a seeded user who owns a store.
 * @returns Resolves once `/admin` has rendered its dashboard heading.
 */
async function signIn(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/admin(\?.*)?$/, { timeout: 20000 });
  await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 20000 });
}

test.describe('Platform admin door', () => {
  // Each test compiles several dev-mode routes on first request; the default 30s budget expires
  // for reasons that have nothing to do with the navigation being tested.
  test.setTimeout(120000);

  test('a platform admin sees the Admin item in the sidebar footer and it opens /platform', async ({
    page,
  }) => {
    await signIn(page, PLATFORM_ADMIN);

    const adminLink = page.getByRole('link', { name: 'Admin', exact: true });
    await expect(adminLink).toBeVisible({ timeout: 20000 });

    // It belongs in the footer, alongside "View store" and "Sign out" — not in the grouped nav.
    const footer = page.locator('[class*="navFooter"]');
    await expect(footer.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();

    await adminLink.click();
    await page.waitForURL(/\/platform/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/platform/);

    // The door has to open onto the console, not onto Next's not-found page.
    await expect(page.getByText(/this page could not be found/i)).toHaveCount(0);
  });

  test('a merchant who is not a platform admin is not shown the Admin item', async ({ page }) => {
    await signIn(page, MERCHANT);

    // Sign out proves the footer itself rendered, so the absence below is the item missing rather
    // than the nav never having drawn.
    await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await expect(page.locator('[class*="navFooter"]').getByRole('link')).toHaveCount(0);
  });

  test('a merchant who is not a platform admin is refused at /platform', async ({ page }) => {
    await signIn(page, MERCHANT);

    const response = await page.goto('/platform');
    const status = response?.status() ?? 0;
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').innerText();

    // The assertion that matters: whatever this page decides to render, it is not another
    // tenant's data.
    for (const storeName of OTHER_TENANT_STORE_NAMES) {
      expect(
        bodyText.toLowerCase(),
        `/platform leaked the store "${storeName}" to a non-admin merchant`,
      ).not.toContain(storeName.toLowerCase());
    }

    // And it actively refuses, by whichever mechanism the page owner chose: an error status, a
    // redirect away from /platform, or an access message rendered in place.
    const stayedOnPlatform = new URL(page.url()).pathname.startsWith('/platform');
    const refusedInPage = REFUSAL_PATTERN.test(bodyText);

    expect(
      status >= 400 || !stayedOnPlatform || refusedInPage,
      `/platform served a non-admin merchant a ${status} at ${page.url()} with no refusal in the page`,
    ).toBeTruthy();
  });
});
