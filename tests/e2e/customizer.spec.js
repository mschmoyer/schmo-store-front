const { test, expect } = require('@playwright/test');

/**
 * The customizer, driven rather than read.
 *
 * Every case here is a defect that was invisible to the unit suite because it
 * only exists once a real browser applies a real response header, lays out a
 * real iframe, or dispatches a real key event through dnd-kit:
 *
 *  - the preview could not load at all in production, because
 *    `X-Frame-Options: DENY` was served on `/(.*)`, which matches `/store/*`.
 *    Nothing in the repository asserted the frame ever opened;
 *  - "Desktop" was whatever width was left over — 738px at a 1440 window — so
 *    the merchant previewed a hamburger nav for a breakpoint that shows a full
 *    one, and "Tablet" clamped to the same 738px;
 *  - Alt+Arrow reordering was advertised in the grip's accessible name and did
 *    nothing, because dnd-kit's `onKeyDown` shadowed the handler.
 *
 * Requires the dev server on :3000 and the seeded demo account.
 */

const EMAIL = 'demo@schmostore.com';
const PASSWORD = 'rebeldev';

/**
 * Sign in over the API and seed the token the admin shell reads.
 *
 * @param {import('@playwright/test').Page} page - The page to authenticate
 */
async function signIn(page) {
  const response = await page.request.post('/api/admin/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const token = (await response.json())?.data?.session?.sessionToken;
  expect(token).toBeTruthy();
  await page.addInitScript((value) => {
    localStorage.setItem('admin_token', value);
    localStorage.setItem('adminToken', value);
  }, token);
}

/**
 * Open the customizer and wait for the preview to complete its handshake.
 *
 * @param {import('@playwright/test').Page} page - An authenticated page
 */
async function openCustomizer(page) {
  await page.goto('/admin/design', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const frame = document.querySelector('iframe');
          try {
            return Boolean(frame?.contentDocument?.querySelector('#storefront-theme'));
          } catch {
            return false;
          }
        }),
      { timeout: 60_000, message: 'the preview iframe never rendered the storefront' },
    )
    .toBe(true);
}

/** Section ids in rendered order. */
const sectionOrder = (page) =>
  page.$$eval('[data-section-row]', (rows) =>
    rows.map((row) => row.getAttribute('data-section-row')),
  );

test.describe('the preview iframe', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('is allowed to frame the storefront at all', async ({ page }) => {
    // The header that broke this is per-path, so assert on the response the
    // browser actually gets for the previewed URL.
    const response = await page.request.get('/store/demo-electronics');
    expect(response.ok()).toBeTruthy();
    const xfo = response.headers()['x-frame-options'];
    expect(xfo === undefined || xfo.toLowerCase() === 'sameorigin').toBeTruthy();
  });

  test('loads, and the storefront answers the handshake', async ({ page }) => {
    await openCustomizer(page);
    const rendered = await page.evaluate(() => {
      const doc = document.querySelector('iframe').contentDocument;
      return {
        title: doc.title,
        sections: doc.querySelectorAll('[data-section-id]').length,
        text: doc.body.innerText.slice(0, 200),
      };
    });
    expect(rendered.title).not.toBe('');
    expect(rendered.text.length).toBeGreaterThan(0);
    await expect(page.getByText('Loading your storefront…')).toBeHidden();
  });

  test('repaints a colour change without reloading', async ({ page }) => {
    await openCustomizer(page);

    /*
     * A reload is detected by marking the preview's own window and checking the
     * mark survives. `framenavigated` is not usable here: Playwright emits the
     * iframe's *initial* navigation asynchronously, well after the document is
     * readable, so a listener attached at this point still sees it and reports
     * a reload that never happened.
     */
    await page.evaluate(() => {
      document.querySelector('iframe').contentWindow.__repaintMarker = 'alive';
    });

    await page.locator('button', { hasText: /^Theme$/ }).first().click();
    await page.getByRole('button', { name: /Colour/i }).first().click();

    const index = await page.evaluate(() =>
      [...document.querySelectorAll('input')].findIndex(
        (input) => input.type !== 'color' && /^#[0-9a-f]{6}$/i.test(input.value),
      ),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const original = await page.locator('input').nth(index).inputValue();
    await page.locator('input').nth(index).fill('#123456');

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (
              document.querySelector('iframe').contentDocument.querySelector('#storefront-theme')
                ?.textContent ?? ''
            ).includes('#123456'),
          ),
        { timeout: 10_000, message: 'the preview never repainted' },
      )
      .toBe(true);

    const survived = await page.evaluate(
      () => document.querySelector('iframe').contentWindow.__repaintMarker,
    );
    expect(survived, 'the preview must repaint, not reload').toBe('alive');

    await page.locator('input').nth(index).fill(original);
    await page.waitForTimeout(1500);
  });
});

test.describe('the viewport switcher', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('gives Desktop a real desktop width, wide enough for the full nav', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCustomizer(page);

    const width = await page.evaluate(
      () => document.querySelector('iframe').contentWindow.innerWidth,
    );
    expect(width).toBeGreaterThanOrEqual(1024);

    // The proof that matters: the storefront's own navigation, not a hamburger.
    const header = await page.evaluate(
      () => document.querySelector('iframe').contentDocument.querySelector('header')?.innerText ?? '',
    );
    expect(header.split('\n').filter(Boolean).length).toBeGreaterThan(3);
  });

  test('says how far it has scaled the preview to fit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCustomizer(page);
    await expect(page.getByTestId('viewport-badge')).toContainText('1280px wide');
    await expect(page.getByTestId('viewport-badge')).toContainText('shown at');
  });

  test('renders Tablet at a genuinely different width from Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCustomizer(page);

    const measure = () =>
      page.evaluate(() => document.querySelector('iframe').contentWindow.innerWidth);

    const desktop = await measure();
    await page.getByRole('button', { name: /tablet preview/i }).click();
    await expect
      .poll(measure, { timeout: 10_000 })
      .toBeLessThan(desktop);

    const tablet = await measure();
    expect(tablet).toBeGreaterThan(800);
    expect(tablet).toBeLessThan(860);

    await page.getByRole('button', { name: /mobile preview/i }).click();
    await expect.poll(measure, { timeout: 10_000 }).toBeLessThan(500);
  });
});

test.describe('keyboard reordering', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('Alt+Arrow actually moves a section', async ({ page }) => {
    await openCustomizer(page);

    const before = await sectionOrder(page);
    expect(before.length).toBeGreaterThan(1);

    const grip = page.locator(`[data-section-grip="${before[0]}"]`);
    await expect(grip).toHaveAttribute('aria-label', /hold alt and press the up and down arrows/);

    await grip.focus();
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Alt');

    await expect.poll(() => sectionOrder(page), { timeout: 10_000 }).not.toEqual(before);

    const after = await sectionOrder(page);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);

    // Put it back, and prove the reverse direction works too.
    await page.locator(`[data-section-grip="${before[0]}"]`).focus();
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Alt');
    await expect.poll(() => sectionOrder(page), { timeout: 10_000 }).toEqual(before);

    // Let the debounced autosave land, so the next test starts from this order.
    await page.waitForTimeout(2000);
  });
});
