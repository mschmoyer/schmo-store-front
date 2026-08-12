const { test, expect } = require('@playwright/test');

/**
 * End-to-end coverage for the public marketing site.
 *
 * The marketing pages are the top of the funnel and had no e2e coverage at all
 * while `tests/e2e/` carried four admin suites. Every assertion below pins a
 * defect this site has actually shipped, not a hypothetical one:
 *
 *   - the whole document rendered as empty coloured stripes with JavaScript
 *     disabled, because 65 elements shipped at `opacity: 0`;
 *   - `/pricing` told the visitor "Card required." when the signup wizard takes
 *     no card;
 *   - the header's "Pricing" link was an in-page anchor, not a route;
 *   - 72 elements overflowed the viewport at 390px and the sync table forced a
 *     horizontal scrollbar onto the document;
 *   - the homepage reached 12,381px at 1440 and 15,605px at 390.
 *
 * Runs against the dev server the repo already expects on :3000 (see
 * `playwright.config.js` — `baseURL` is set and `webServer` is deliberately
 * commented out, so this file starts nothing of its own).
 */

/** Every public marketing route, with the copy that must open it. */
const ROUTES = [
  { path: '/', heading: /ShipStation catalog, now a storefront/i },
  { path: '/pricing', heading: /One plan\. \$19\.99 a month/i },
  { path: '/features', heading: /.+/ },
  { path: '/how-it-works', heading: /.+/ },
  { path: '/demo-stores', heading: /.+/ },
];

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/**
 * HEIGHT BUDGETS.
 *
 * These are the deliberate figures, and they are enforced because an
 * unenforced budget is a number in a document that the next section quietly
 * exceeds. The homepage was 12,381px at 1440 and 10,772px at 390 before the
 * rebuild; it measures ~6,730 and ~6,820 now.
 *
 * NOTE ON THE DESKTOP NUMBER — it was 6,500 during the mobile pass and is
 * 6,900 now, and it moved UP on purpose. The mobile pass had capped the shared
 * `--section-y` at 64px at every width, which made 1440 read as unfinished:
 * docs/design-system.md §4 specifies an 80–128px marketing rhythm. Restoring a
 * genuinely fluid 28px → 88px token cost ~390px on desktop and bought back the
 * spacing. The budget exists to stop DEAD space and duplicated sections coming
 * back — 5,937px of the original page rendered byte-identically on /features
 * and /how-it-works — not to starve the vertical rhythm. Do not "fix" a
 * failure here by tightening the scale again; delete content instead.
 */
const BUDGET = { desktop: 6900, mobile: 7000 };

/**
 * Reads the document's scroll geometry.
 *
 * @param {import('@playwright/test').Page} page - The page under test.
 * @returns {Promise<{scrollWidth: number, clientWidth: number, height: number}>}
 *   Document width, viewport width and full document height.
 */
async function geometry(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    height: document.body.scrollHeight,
  }));
}

/**
 * Loads a marketing route and waits for the images to settle, because a page
 * measured before its hero image has laid out is not the page a reader sees.
 *
 * @param {import('@playwright/test').Page} page - The page under test.
 * @param {string} path - Route path, e.g. `/pricing`.
 * @returns {Promise<import('@playwright/test').Response|null>} The navigation response.
 */
async function open(page, path) {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  await page.waitForLoadState('load');
  return response;
}

/**
 * Timeout for a request or navigation that may be the FIRST hit on a route in
 * a dev server, where Next compiles it on demand. The config's 15s action
 * timeout is right for interacting with a rendered page and far too short for
 * a cold compile of `/create-store` or a seeded storefront.
 */
const COLD_COMPILE = 60000;

/* ========================================================================= */

test.describe('Marketing — routes render', () => {
  for (const route of ROUTES) {
    test(`${route.path} returns 200 and renders its h1`, async ({ page }) => {
      const response = await open(page, route.path);

      expect(response, `no response for ${route.path}`).not.toBeNull();
      expect(response.status(), `${route.path} status`).toBe(200);

      const h1 = page.locator('h1');
      await expect(h1).toHaveCount(1);
      await expect(h1).toBeVisible();
      await expect(h1).toHaveText(route.heading);
    });
  }
});

/* ========================================================================= */

test.describe('Marketing — no horizontal scroll', () => {
  for (const [name, viewport] of [
    ['mobile 390', MOBILE],
    ['desktop 1440', DESKTOP],
  ]) {
    test.describe(name, () => {
      test.use({ viewport });

      for (const route of ROUTES) {
        test(`${route.path} never scrolls sideways`, async ({ page }) => {
          await open(page, route.path);
          const { scrollWidth, clientWidth } = await geometry(page);

          // A wide table or card that widens the DOCUMENT is the regression.
          // Scrolling INSIDE a labelled region is fine and is not measured here.
          expect(
            { route: route.path, scrollWidth, clientWidth },
            'the document must never be wider than the viewport'
          ).toEqual({ route: route.path, scrollWidth: clientWidth, clientWidth });
        });
      }
    });
  }
});

/* ========================================================================= */

test.describe('Marketing — homepage height budget', () => {
  test('stays inside the desktop budget at 1440', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, '/');
    const { height } = await geometry(page);
    expect({ height, budget: BUDGET.desktop, within: height <= BUDGET.desktop }).toEqual({
      height,
      budget: BUDGET.desktop,
      within: true,
    });
  });

  test('stays inside the mobile budget at 390', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/');
    const { height } = await geometry(page);
    expect({ height, budget: BUDGET.mobile, within: height <= BUDGET.mobile }).toEqual({
      height,
      budget: BUDGET.mobile,
      within: true,
    });
  });
});

/* ========================================================================= */

test.describe('Marketing — the primary call to action', () => {
  for (const [name, viewport] of [
    ['mobile 390', MOBILE],
    ['desktop 1440', DESKTOP],
  ]) {
    test(`${name}: the hero CTA is visible and goes to /create-store`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/');

      const cta = page
        .locator('#main')
        .getByRole('link', { name: 'Start for $1', exact: true })
        .first();
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/create-store');

      await cta.click();
      await expect(page).toHaveURL(/\/create-store$/, { timeout: COLD_COMPILE });
    });
  }
});

/* ========================================================================= */

test.describe('Marketing — navigation resolves', () => {
  test('desktop: every header and footer link is a real page', async ({ page }) => {
    test.slow();
    await page.setViewportSize(DESKTOP);
    await open(page, '/');

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('header a[href], footer a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.startsWith('/'))
        .map((h) => h.split('#')[0] || '/')
    );

    expect(hrefs.length).toBeGreaterThan(8);

    const broken = [];
    for (const href of Array.from(new Set(hrefs))) {
      const res = await page.request.get(href, { timeout: COLD_COMPILE });
      if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken).toEqual([]);
  });

  test('desktop: the nav links out of the homepage, it does not scroll it', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, '/');

    // `ROUTES.pricing` used to be `/#pricing`, so "Pricing" scrolled the reader
    // 8.4 screens down the homepage instead of loading the page built for it.
    const pricing = page.locator('header nav a', { hasText: 'Pricing' });
    await expect(pricing).toHaveAttribute('href', '/pricing');
    await pricing.click();
    await expect(page).toHaveURL(/\/pricing$/, { timeout: COLD_COMPILE });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('mobile: the menu opens, traps focus, closes on Escape and navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/');

    const toggle = page.getByRole('button', { name: 'Open menu' });
    await expect(toggle).toBeVisible();

    // The toggle is a thumb target, not a 24px icon.
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);

    await toggle.click();
    const panel = page.locator('#site-menu');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-modal', 'true');

    // Focus moves into the panel on open.
    const links = panel.locator('a');
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThanOrEqual(5);
    await expect(links.first()).toBeFocused();

    // …and it is trapped: shift-tabbing off the first item wraps to the last.
    await page.keyboard.press('Shift+Tab');
    const focusInsidePanel = await page.evaluate(() =>
      document.getElementById('site-menu').contains(document.activeElement)
    );
    expect(focusInsidePanel).toBe(true);

    // Escape closes it and hands focus back to the control that opened it.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();

    // Every link in the panel points at a page that exists.
    await page.getByRole('button', { name: 'Open menu' }).click();
    const hrefs = await panel.locator('a[href^="/"]').evaluateAll((nodes) =>
      nodes.map((a) => a.getAttribute('href').split('#')[0] || '/')
    );
    const broken = [];
    for (const href of Array.from(new Set(hrefs))) {
      const res = await page.request.get(href, { timeout: COLD_COMPILE });
      if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken).toEqual([]);

    // And one of them actually navigates.
    await panel.getByRole('link', { name: 'Features' }).click();
    await expect(page).toHaveURL(/\/features$/, { timeout: COLD_COMPILE });
    await expect(page.locator('h1')).toBeVisible();
  });
});

/* ========================================================================= */

test.describe('Marketing — tap targets', () => {
  test.use({ viewport: MOBILE });

  /**
   * Every standalone call to action on the homepage, by its exact label. Text
   * links inside a sentence are exempt; these are not — a `variant="link"`
   * button rendered a 24px box next to a 48px primary.
   */
  const CTA_LABELS = [
    'Start for $1',
    'See a live store',
    'Connect ShipStation',
    "See what's included",
    'Open a demo store',
    'See pricing',
    'Read the FAQ',
    'See the full twelve-month table',
  ];

  test('every homepage CTA clears 44px', async ({ page }) => {
    await open(page, '/');

    const small = await page.evaluate((labels) => {
      const wanted = new Set(labels.map((l) => l.replace(/['’]/g, "'")));
      const out = [];
      for (const el of document.querySelectorAll('main a, main button')) {
        const text = (el.innerText || '').replace(/\s*→\s*$/, '').replace(/['’]/g, "'").trim();
        if (!wanted.has(text)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;
        if (rect.height < 44) out.push(`${text} → ${Math.round(rect.height)}px`);
      }
      return out;
    }, CTA_LABELS);

    expect(small).toEqual([]);
  });

  test('the sticky header does not eat the viewport', async ({ page }) => {
    await open(page, '/');
    const headerHeight = await page
      .locator('header')
      .evaluate((el) => el.getBoundingClientRect().height);

    // Under 12% of an 844px phone screen, scrolled and unscrolled alike.
    expect(headerHeight).toBeLessThanOrEqual(100);

    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(400);
    const scrolledHeight = await page
      .locator('header')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(scrolledHeight).toBeLessThanOrEqual(100);
  });
});

/* ========================================================================= */

test.describe('Marketing — renders without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const route of ROUTES) {
    test(`${route.path} still has its words`, async ({ page }) => {
      const response = await page.goto(route.path, { waitUntil: 'load' });
      expect(response.status()).toBe(200);

      // The rejected build shipped 65 elements at `opacity: 0` from a scroll
      // reveal, so an 11,261px document rendered as empty coloured stripes.
      const words = await page.evaluate(() => {
        const main = document.getElementById('main') || document.body;
        return main.innerText.trim().split(/\s+/).filter(Boolean).length;
      });
      expect({ route: route.path, enoughWords: words >= 150, words }).toEqual({
        route: route.path,
        enoughWords: true,
        words,
      });

      await expect(page.locator('h1')).toBeVisible();
    });
  }

  test('the homepage carries no transparent-by-default content', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const invisible = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll('#main *')) {
        if ((el.textContent || '').trim().length === 0) continue;
        if (Number(getComputedStyle(el).opacity) === 0) count += 1;
      }
      return count;
    });
    expect(invisible).toBe(0);
  });
});

/* ========================================================================= */

test.describe('Marketing — pricing tells the truth', () => {
  test('shows both prices and never claims a card is required', async ({ page }) => {
    await open(page, '/pricing');

    const body = await page.locator('body').innerText();

    expect(body).toContain('$1');
    expect(body).toContain('$19.99');

    // `PricingPage.tsx` shipped "Card required." twelve lines below a docblock
    // in the same file saying the page takes no card — and `/create-store`
    // takes none either. The page now says the true, and better, version.
    expect(body).toContain('No card required');

    // …and nowhere says the false one. Removing the true sentence first is
    // what makes this assert the CLAIM rather than the substring: "No card
    // required to start." contains "card required".
    const withoutTheTrueVersion = body.replace(/no card required/gi, '');
    expect(withoutTheTrueVersion.toLowerCase()).not.toContain('card required');
  });

  test('the homepage states the price above the fold', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/');

    const microcopy = page.locator('main p', { hasText: '$1 for 3 months' }).first();
    await expect(microcopy).toBeVisible();
    await expect(microcopy).toContainText('$19.99');
    await expect(microcopy).toContainText('No transaction fees');
  });
});
