const { test, expect } = require('@playwright/test');

/**
 * The setup wizard, driven end to end.
 *
 * The mechanics of this flow were already good. What it got wrong was what it
 * *said*, and the last screen — which is what a merchant judges the product on
 * — said three untrue things at once: it marked skipped steps "Done", it
 * claimed "Anyone with this address can shop it right now", and the store it
 * had just published was a page of admin instructions addressed to the owner,
 * on a public URL the merchant had been told to send to someone.
 *
 * These cases are therefore about claims, not clicks: what the rail says about
 * a skipped step, what the launch screen promises, what a shopper sees, and
 * whether Back means "back a step" or "leave".
 *
 * Requires the dev server on :3000.
 */

/** Unique per run, so a rerun does not collide on email or slug. */
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * Walk the wizard as far as a given step, skipping ShipStation and the import.
 *
 * @param {import('@playwright/test').Page} page - A fresh page
 * @param {'shipstation' | 'import' | 'style' | 'launch'} until - Where to stop
 * @returns {Promise<{ email: string, storeName: string }>} What was created
 */
async function walk(page, until) {
  const id = stamp();
  const email = `e2e-${id}@example.com`;
  const storeName = `E2E Shop ${id}`;

  await page.goto('/create-store', { waitUntil: 'domcontentloaded' });

  await page.getByLabel('First name').fill('Case');
  await page.getByLabel('Last name').fill('Runner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await expect(page.getByRole('heading', { name: 'Name your store' })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByLabel('Store name').fill(storeName);
  // The slug is checked server-side; wait for it to settle before continuing.
  await expect(page.getByLabel('Store address')).not.toHaveValue('', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await expect(page.getByRole('heading', { name: 'Connect ShipStation' })).toBeVisible({
    timeout: 30_000,
  });
  if (until === 'shipstation') return { email, storeName };

  await page.getByRole('button', { name: /Skip for now/i }).click();
  await expect(page.getByRole('heading', { name: 'Pull in your catalog' })).toBeVisible({
    timeout: 30_000,
  });
  if (until === 'import') return { email, storeName };

  await page.getByRole('button', { name: /^Continue$/ }).click();
  await expect(page.getByRole('heading', { name: 'Style it and publish' })).toBeVisible({
    timeout: 30_000,
  });
  if (until === 'style') return { email, storeName };

  await page.locator('[class*=presetCard]').first().click();
  await page.getByRole('button', { name: /Publish my store/i }).click();
  await expect(page.getByRole('heading', { name: /is live$/ })).toBeVisible({ timeout: 40_000 });
  return { email, storeName };
}

test.describe('browser Back', () => {
  test('goes back a step instead of leaving the wizard', async ({ page }) => {
    await walk(page, 'shipstation');
    // The address bar is written by an effect, a tick behind the render.
    await expect.poll(() => page.url(), { timeout: 20_000 }).toContain('step=shipstation');

    await page.goBack();

    await expect(page.getByRole('heading', { name: 'Name your store' })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => page.url(), { timeout: 20_000 }).toContain('step=store');
    // And it kept what was typed.
    await expect(page.getByLabel('Store name')).not.toHaveValue('');

    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Connect ShipStation' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('gives each step its own address', async ({ page }) => {
    await page.goto('/create-store', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.url(), { timeout: 20_000 }).toContain('step=account');
  });
});

test.describe('the launch screen', () => {
  test('does not call a skipped step done, or claim the store can be shopped', async ({ page }) => {
    await walk(page, 'launch');

    const rail = page.getByRole('list').first();
    await expect(rail.getByText(/^Skipped/).first()).toBeVisible();
    // Two places say it — the rail and the launch eyebrow — and they agree.
    await expect(page.getByText('3 of 5 done · 2 skipped')).toHaveCount(2);

    const main = page.locator('main');
    await expect(main).not.toContainText('Anyone with this address can shop it right now');
    await expect(main).toContainText('there is nothing in it to sell yet');
  });

  test('says plainly that no card was taken and what the price is', async ({ page }) => {
    await walk(page, 'launch');
    const main = page.locator('main');
    await expect(main).toContainText('We haven’t charged you anything');
    await expect(main).toContainText('$1/month for your first three months');
    await expect(main).toContainText('$19.99/month');
    await expect(main).toContainText('Nothing on the storefront can be bought until you do');
  });
});

test.describe('the store the wizard publishes', () => {
  test('shows a shopper the merchant’s sections, never admin instructions', async ({
    page,
    browser,
  }) => {
    await walk(page, 'launch');
    const url = await page.locator('[class*=urlText]').innerText();
    expect(url).toContain('/store/');

    // A different browser context: no session cookie, i.e. an actual shopper.
    const shopper = await browser.newContext();
    const shopperPage = await shopper.newPage();
    await shopperPage.goto(url, { waitUntil: 'domcontentloaded' });

    const body = shopperPage.locator('body');
    await expect(body).not.toContainText('Manage products');
    await expect(body).not.toContainText('Open your dashboard');
    await expect(body).not.toContainText('No products yet');
    await expect(body).toContainText('Nothing for sale just yet');
    // The merchant's own composition is still there, not replaced by a panel.
    await expect(shopperPage.locator('h1')).toBeVisible();

    await shopper.close();
  });

  test('still shows the owner how to fill it', async ({ page }) => {
    await walk(page, 'launch');
    const url = await page.locator('[class*=urlText]').innerText();

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Manage products')).toBeVisible({ timeout: 20_000 });
  });

  test('carries no announcement the merchant never wrote', async ({ page, browser }) => {
    await walk(page, 'launch');
    const url = await page.locator('[class*=urlText]').innerText();

    const shopper = await browser.newContext();
    const shopperPage = await shopper.newPage();
    await shopperPage.goto(url, { waitUntil: 'domcontentloaded' });

    // Every one of these shipped as preset default announcement copy.
    for (const promise of [
      'Next-day dispatch',
      'Free samples with every order',
      'Free shipping over $95',
      'net-30 terms',
      'Subscribe and save 15%',
    ]) {
      await expect(shopperPage.locator('body')).not.toContainText(promise);
    }

    await shopper.close();
  });
});

test.describe('the style step', () => {
  test('makes no claim about a preview it does not show', async ({ page }) => {
    await walk(page, 'style');
    const main = page.locator('main');
    // The deck's line had no referent: this screen is six tiles, not a preview.
    await expect(main).not.toContainText('This is your real store');
    await expect(main).toContainText('example copy you can rewrite in Design');
  });
});
