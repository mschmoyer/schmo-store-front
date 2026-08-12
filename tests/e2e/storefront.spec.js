const { test, expect } = require('@playwright/test');

/**
 * End-to-end coverage for the shopper-facing storefront.
 *
 * `tests/e2e/` carried four admin suites and a marketing suite and nothing at
 * all for the surface a customer actually buys from. Every assertion below pins
 * a defect this storefront has really shipped, measured, not a hypothetical:
 *
 *   - **checkout and order-success were not the merchant's shop.** They rendered
 *     the RebelShops `TopNav`, had no `[data-store-id]` wrapper, and all 40 of
 *     checkout's `var(--theme-*)` references plus every `--st-*` resolved to the
 *     empty string. The shop stopped looking like the shop at the exact moment
 *     a card number was required.
 *   - **every link-shaped button bypassed auto-contrast.** A scoped
 *     `a { color: inherit }` at specificity (0,2,1) beat `.btn` at (0,1,0), so
 *     an `<a class="btn">` inherited `--st-text` while a `<button class="btn">`
 *     next to it used the `--st-on-brand` the engine had computed. That shipped
 *     a primary hero CTA at 2.07:1.
 *   - **disabled buttons composited to 1.71:1** because a blanket `opacity: .5`
 *     faded the label and the fill together.
 *   - **with JavaScript off the shop was empty** — the body streamed into
 *     `div[hidden]` behind a Suspense boundary and was un-hidden by an inline
 *     script. The home page showed 347 visible characters; `/products` showed 0.
 *   - **the three demo stores rendered one page.** All six presets fell through
 *     to a single hardcoded section list, so "six presets" was six colourways.
 *   - **hero images were seeded to disk and never read**, leaving 43–49% of the
 *     first screen empty on every store.
 *
 * Runs against the dev server the repo already expects on :3000 (see
 * `playwright.config.js` — `baseURL` is set and `webServer` is deliberately
 * commented out, so this file starts nothing of its own).
 */

/** The three seeded demo shops, one per theme register. */
const STORES = [
  { slug: 'demo-electronics', name: /Basecamp Audio/i },
  { slug: 'artisan-craft', name: /Fernwood Goods/i },
  { slug: 'fitness-pro', name: /Ironline Fitness/i },
];

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** WCAG AA for normal-size text. */
const AA_TEXT = 4.5;

/**
 * Relative luminance of an sRGB triple.
 * @param {number[]} rgb - `[r, g, b]`, 0-255
 * @returns {number} Luminance, 0-1
 */
function luminance(rgb) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/**
 * WCAG contrast ratio between two opaque sRGB triples.
 * @param {number[]} a - First colour
 * @param {number[]} b - Second colour
 * @returns {number} Ratio between 1 and 21
 */
function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

/**
 * Resolve a control's rendered ink and ground to opaque sRGB.
 *
 * Runs in the page and composites through a 1x1 canvas rather than parsing the
 * computed string, because a themed button's fill can be a `color-mix()` or an
 * `oklab()` and its ground can be three transparent ancestors deep. This is the
 * colour a shopper's eye receives, which is the only one worth asserting on.
 *
 * @param {import('@playwright/test').Locator} locator - The control
 * @returns {Promise<{fg: number[], bg: number[], fgCss: string}>} Composited colours
 */
async function inkAndGround(locator) {
  return locator.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const paint = (color, backdrop) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2]];
    };

    const chain = [];
    for (let node = el; node; node = node.parentElement) {
      chain.unshift(getComputedStyle(node).backgroundColor);
    }
    let bg = [255, 255, 255];
    for (const layer of chain) bg = paint(layer, `rgb(${bg.join(',')})`);

    const style = getComputedStyle(el);
    return { fg: paint(style.color, `rgb(${bg.join(',')})`), bg, fgCss: style.color };
  });
}

/* ------------------------------------------------------------------ *
 * The purchase journey
 * ------------------------------------------------------------------ */

test.describe('the purchase journey stays inside the merchant\'s shop', () => {
  for (const width of [DESKTOP, MOBILE]) {
    test(`home to order confirmation at ${width.width}px`, async ({ page }) => {
      await page.setViewportSize(width);
      const base = '/store/demo-electronics';

      // Home.
      await page.goto(base);
      await expect(page.locator('div.storefront[data-store-id]')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();

      // Listing.
      await page.goto(`${base}/products`);
      const firstProduct = page.locator('a[href*="/product/"]').first();
      await expect(firstProduct).toBeVisible();
      const productHref = await firstProduct.getAttribute('href');

      // Product detail, then add to cart.
      await page.goto(productHref);
      const addToCart = page.getByRole('button', { name: /add to cart/i });
      await expect(addToCart).toBeVisible();
      await addToCart.click();
      await expect(
        page.getByRole('status').filter({ hasText: /added to your cart/i }),
      ).toBeVisible();

      // Cart.
      await page.goto(`${base}/cart`);
      await expect(page.getByRole('link', { name: /^checkout$/i })).toBeVisible();

      // Checkout. This is the step that used to leave the shop entirely.
      await page.goto(`${base}/checkout`);
      await expect(page.locator('div.storefront[data-store-id]')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: /review your order/i })).toBeVisible();
      // `#email` and not `getByLabel`: the footer newsletter also labels an
      // email field, and the point here is the *checkout* form.
      await expect(page.locator('#email')).toBeVisible();

      // Order confirmation, forced — no demo store can complete a Stripe
      // payment, so the confirmation is reached directly. Its *error* branch is
      // the one that used to be a dead end with no link out.
      await page.goto(`${base}/order-success?session_id=cs_test_not_a_real_session`);
      await expect(page.locator('div.storefront[data-store-id]')).toHaveCount(1);
      await expect(
        page.getByRole('link', { name: /keep shopping|continue shopping/i }).first(),
      ).toBeVisible();
    });
  }

  test('checkout and order-success carry the merchant chrome, not RebelShops', async ({ page }) => {
    for (const path of ['/checkout', '/order-success']) {
      await page.goto(`/store/demo-electronics${path}`);

      // The merchant's header and footer, both from `StorefrontShell`.
      await expect(page.getByRole('banner').getByText(/basecamp audio/i).first()).toBeVisible();
      await expect(page.getByRole('contentinfo')).toContainText(/basecamp audio/i);

      // ...and not ours. `TopNav`'s own nav was "Shop / Journal" over a white
      // Inter page; the merchant's nav is their categories.
      await expect(page.locator('nav a[href="/pricing"]')).toHaveCount(0);
    }
  });

  test('every storefront token resolves on checkout, none are empty strings', async ({ page }) => {
    await page.goto('/store/demo-electronics/checkout');

    const tokens = await page.locator('div.storefront[data-store-id]').evaluate((el) => {
      const style = getComputedStyle(el);
      const names = [
        '--st-brand', '--st-on-brand', '--st-surface', '--st-surface-raised',
        '--st-text', '--st-text-muted', '--st-border', '--st-font-heading',
        '--st-font-body', '--st-radius-card', '--st-radius-button', '--st-space-5',
      ];
      return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
    });

    for (const [name, value] of Object.entries(tokens)) {
      expect(value, `${name} must resolve on the checkout page`).not.toBe('');
    }

    // The page ground is the merchant's, not a white admin form.
    const surface = await page
      .locator('div.storefront[data-store-id]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(surface).not.toBe('rgb(255, 255, 255)');
  });
});

/* ------------------------------------------------------------------ *
 * Auto-contrast
 * ------------------------------------------------------------------ */

test.describe('auto-contrast survives the tag a button is written with', () => {
  /**
   * Plant three identical `.btn` controls in one container and measure all
   * three, in a single round trip.
   *
   * Two reasons it is one `evaluate` rather than an inject-then-locate pair.
   * Correctness: sampling real buttons off the page compares different grounds
   * — the hero CTA sits on a band, quick-add sits on a card's image tile — so a
   * difference in measured contrast would prove nothing about the tag. And
   * stability: the dev server hot-reloads, and a fast refresh between injecting
   * a probe and reading it takes the probe with it.
   *
   * @param {import('@playwright/test').Page} page - The page under test
   * @returns {Promise<{link: object, button: object, disabled: object}>} Composited colours
   */
  function measureProbes(page) {
    return page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const paint = (color, backdrop) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return [data[0], data[1], data[2]];
      };
      const read = (el) => {
        const chain = [];
        for (let node = el; node; node = node.parentElement) {
          chain.unshift(getComputedStyle(node).backgroundColor);
        }
        let bg = [255, 255, 255];
        for (const layer of chain) bg = paint(layer, `rgb(${bg.join(',')})`);
        const style = getComputedStyle(el);
        return { fg: paint(style.color, `rgb(${bg.join(',')})`), bg, fgCss: style.color };
      };

      const model = document.querySelector('[data-section-type="hero"] a[class*="btn"]');
      if (!model) throw new Error('the hero has no button-shaped link to model');

      const host = document.createElement('div');
      host.style.display = 'flex';
      host.style.gap = '8px';

      const link = document.createElement('a');
      link.className = model.className;
      link.href = '#';
      link.textContent = 'Probe';

      const button = document.createElement('button');
      button.className = model.className;
      button.textContent = 'Probe';

      const dead = document.createElement('button');
      dead.className = model.className;
      dead.disabled = true;
      dead.textContent = 'Out of stock';

      host.append(link, button, dead);
      model.parentElement.append(host);

      const result = {
        link: read(link),
        button: read(button),
        disabled: read(dead),
      };
      host.remove();
      return result;
    });
  }

  for (const store of STORES) {
    test(`an <a class=btn> and a <button class=btn> match on ${store.slug}`, async ({ page }) => {
      await page.goto(`/store/${store.slug}`);
      const { link, button } = await measureProbes(page);

      // Same class, same variable, same parent, different tag: the exact
      // comparison the specificity bug failed.
      expect(link.fgCss, `<a> and <button> must resolve the same ink on ${store.slug}`).toBe(
        button.fgCss,
      );
      expect(link.fg).toEqual(button.fg);
      expect(link.bg).toEqual(button.bg);
    });

    test(`the primary CTA and its disabled twin clear AA on ${store.slug}`, async ({ page }) => {
      await page.goto(`/store/${store.slug}`);
      const { link, disabled } = await measureProbes(page);

      const cta = contrast(link.fg, link.bg);
      expect(cta, `primary CTA measured ${cta.toFixed(2)}:1 on ${store.slug}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );

      // Disabled is information — "Out of stock" is the highest-intent message
      // on a product page — and a blanket `opacity: .5` on a brand fill took it
      // to 1.71:1 on a solid preset and 1.75:1 on an outline one.
      const dead = contrast(disabled.fg, disabled.bg);
      expect(
        dead,
        `disabled button measured ${dead.toFixed(2)}:1 on ${store.slug}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

/* ------------------------------------------------------------------ *
 * Presets are six designs
 * ------------------------------------------------------------------ */

test.describe('the demo stores are three shops, not one page three colours', () => {
  test('each store renders its own section composition and copy', async ({ page }) => {
    const seen = [];

    for (const store of STORES) {
      await page.goto(`/store/${store.slug}`);
      const composition = await page.evaluate(() =>
        [...document.querySelectorAll('[data-section-type]')].map((el) => el.dataset.sectionType),
      );
      const headline = (await page.locator('h1').first().textContent()).trim();

      expect(composition.length, `${store.slug} should render sections`).toBeGreaterThan(3);
      seen.push({ slug: store.slug, sequence: composition.join('>'), headline });
    }

    const sequences = new Set(seen.map((s) => s.sequence));
    expect(sequences.size, `compositions were ${JSON.stringify(seen.map((s) => s.sequence))}`).toBe(
      STORES.length,
    );

    const headlines = new Set(seen.map((s) => s.headline));
    expect(headlines.size, `headlines were ${JSON.stringify([...headlines])}`).toBe(STORES.length);
  });

  test('every store renders its hero photograph', async ({ page }) => {
    for (const store of STORES) {
      await page.goto(`/store/${store.slug}`);
      const heroImage = page.locator('[data-section-type="hero"] img').first();
      await expect(heroImage, `${store.slug} hero art`).toBeVisible();
    }
  });
});

/* ------------------------------------------------------------------ *
 * No JavaScript
 * ------------------------------------------------------------------ */

test.describe('the shop renders without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ['', '/products']) {
    test(`/store/demo-electronics${path} has real content and nothing hidden`, async ({ page }) => {
      await page.goto(`/store/demo-electronics${path}`);

      const measured = await page.evaluate(() => ({
        visible: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
        hidden: [...document.querySelectorAll('div[hidden]')].reduce(
          (total, node) => total + (node.textContent || '').length,
          0,
        ),
        products: document.querySelectorAll('a[href*="/product/"]').length,
      }));

      // 347 characters on the home page and 0 on the listing, before.
      expect(measured.visible).toBeGreaterThan(600);
      expect(measured.hidden, 'no content may be parked in a hidden div').toBe(0);
      expect(measured.products, 'products must be in the server-rendered HTML').toBeGreaterThan(3);
    });
  }
});

/* ------------------------------------------------------------------ *
 * Layout stability and reflow
 * ------------------------------------------------------------------ */

test.describe('layout', () => {
  test('the home page does not shift as it loads', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto('/store/demo-electronics');
    await page.waitForTimeout(4000);
    const cls = await page.evaluate(() => window.__cls);

    // 0.3077 before, against Google's 0.1 "good" threshold.
    expect(cls, `CLS measured ${cls.toFixed(4)}`).toBeLessThan(0.1);
  });

  test('no page scrolls horizontally at 390px', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    for (const path of ['', '/products', '/cart', '/checkout', '/order-success']) {
      await page.goto(`/store/demo-electronics${path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflowed by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
});
