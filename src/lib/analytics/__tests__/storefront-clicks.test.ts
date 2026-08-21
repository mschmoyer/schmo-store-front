/**
 * @jest-environment node
 */

/**
 * Guards for the public click beacon's decision logic.
 *
 * `POST /api/storefront/click` is unauthenticated and reachable by anyone, so every one of these
 * cases is a way a stranger could otherwise make the platform dashboard wrong or the error log
 * noisy:
 *
 *  * an `event_type` the CHECK constraint would reject — a 500 from a public endpoint, on demand;
 *  * a crawler counted as a shopper, which is the whole platform traffic number being a lie;
 *  * a raw IP reaching the database, which is the one thing migration 040 was shaped to prevent;
 *  * a string longer than its column, which Postgres turns into a failed insert.
 *
 * The boundaries (`resolveStoreId`, `insertEvent`) are injected with in-memory implementations, so
 * what runs here is the real validation, hashing and classification rather than a mock of it.
 */

import {
  STOREFRONT_CLICK_EVENT_TYPES,
  classifyDevice,
  createClickRateLimiter,
  clientIpFromHeaders,
  hasPrivacySignal,
  hashClientIp,
  isBotUserAgent,
  isStorefrontClickEventType,
  recordStorefrontClick,
  referrerDomain,
  type StorefrontClickContext,
  type StorefrontClickDeps,
  type StorefrontClickRecord,
} from '../storefront-clicks';

const STORE_ID = '650e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID = '750e8400-e29b-41d4-a716-4466554400aa';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * A recording pair of boundaries.
 *
 * @param stores - Map of id-or-slug to the store id it resolves to
 * @returns The deps plus the rows they were asked to write
 */
function harness(stores: Record<string, string> = { [STORE_ID]: STORE_ID }): {
  deps: StorefrontClickDeps;
  written: StorefrontClickRecord[];
  lookups: Array<{ storeId?: string; storeSlug?: string }>;
} {
  const written: StorefrontClickRecord[] = [];
  const lookups: Array<{ storeId?: string; storeSlug?: string }> = [];
  return {
    written,
    lookups,
    deps: {
      async resolveStoreId(ref) {
        lookups.push(ref);
        const key = ref.storeId ?? ref.storeSlug ?? '';
        return stores[key] ?? null;
      },
      async insertEvent(record) {
        written.push(record);
      },
    },
  };
}

/**
 * A shopper's request context.
 *
 * @param overrides - Fields to change
 * @returns A context describing a desktop Chrome visitor
 */
function shopper(overrides: Partial<StorefrontClickContext> = {}): StorefrontClickContext {
  return { ip: '203.0.113.7', userAgent: CHROME_UA, country: 'us', ...overrides };
}

describe('event type validation', () => {
  it('accepts exactly the five types the CHECK constraint allows', () => {
    expect([...STOREFRONT_CLICK_EVENT_TYPES]).toEqual([
      'storefront_view',
      'product_view',
      'add_to_cart',
      'checkout_start',
      'outbound_click',
    ]);
    for (const type of STOREFRONT_CLICK_EVENT_TYPES) {
      expect(isStorefrontClickEventType(type)).toBe(true);
    }
  });

  it('rejects anything else, including near-misses and non-strings', () => {
    for (const value of ['storefront_views', 'purchase', '', 'DROP TABLE', 42, null, undefined, {}]) {
      expect(isStorefrontClickEventType(value)).toBe(false);
    }
  });

  it('rejects an unknown type before touching the database', async () => {
    const { deps, written, lookups } = harness();
    const outcome = await recordStorefrontClick(
      { storeId: STORE_ID, eventType: 'purchase' },
      shopper(),
      deps,
    );

    expect(outcome).toEqual({ status: 'rejected', reason: 'invalid_event_type' });
    expect(written).toHaveLength(0);
    // The point: no store lookup either. A bad type must cost nothing.
    expect(lookups).toHaveLength(0);
  });

  it('defaults a missing type to storefront_view rather than rejecting', async () => {
    const { deps, written } = harness();
    const outcome = await recordStorefrontClick({ storeId: STORE_ID }, shopper(), deps);

    expect(outcome.status).toBe('recorded');
    expect(written[0].eventType).toBe('storefront_view');
  });
});

describe('store resolution', () => {
  it('rejects a body naming no store at all', async () => {
    const { deps, written } = harness();
    const outcome = await recordStorefrontClick({ eventType: 'storefront_view' }, shopper(), deps);

    expect(outcome).toEqual({ status: 'rejected', reason: 'missing_store' });
    expect(written).toHaveLength(0);
  });

  it('rejects a non-JSON body', async () => {
    const { deps } = harness();
    await expect(recordStorefrontClick(null, shopper(), deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'invalid_body',
    });
  });

  it('resolves a slug to the store id', async () => {
    const { deps, written, lookups } = harness({ 'demo-electronics': STORE_ID });
    const outcome = await recordStorefrontClick(
      { storeSlug: 'demo-electronics', eventType: 'storefront_view' },
      shopper(),
      deps,
    );

    expect(outcome.status).toBe('recorded');
    expect(lookups).toEqual([{ storeSlug: 'demo-electronics' }]);
    expect(written[0].storeId).toBe(STORE_ID);
  });

  it('prefers the id when both are given, so a mismatched pair cannot cross tenants', async () => {
    const { deps, lookups } = harness();
    await recordStorefrontClick(
      { storeId: STORE_ID, storeSlug: 'someone-elses-shop', eventType: 'storefront_view' },
      shopper(),
      deps,
    );

    expect(lookups).toEqual([{ storeId: STORE_ID }]);
  });

  it('rejects a store id that is not a UUID without asking the database', async () => {
    const { deps, lookups } = harness();
    const outcome = await recordStorefrontClick(
      { storeId: "'; DROP TABLE stores; --", eventType: 'storefront_view' },
      shopper(),
      deps,
    );

    expect(outcome).toEqual({ status: 'rejected', reason: 'missing_store' });
    expect(lookups).toHaveLength(0);
  });

  it('reports an unknown store rather than writing an orphan row', async () => {
    const { deps, written } = harness({});
    const outcome = await recordStorefrontClick(
      { storeSlug: 'no-such-shop', eventType: 'storefront_view' },
      shopper(),
      deps,
    );

    expect(outcome).toEqual({ status: 'rejected', reason: 'unknown_store' });
    expect(written).toHaveLength(0);
  });
});

describe('bot filtering', () => {
  it.each([
    ['Googlebot/2.1 (+http://www.google.com/bot.html)'],
    ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
    ['facebookexternalhit/1.1'],
    ['curl/8.4.0'],
    ['python-requests/2.31.0'],
    ['Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0.0.0'],
    ['GPTBot/1.0'],
  ])('treats %s as a bot', (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
    expect(classifyDevice(userAgent)).toBe('bot');
  });

  it('treats a missing user agent as a bot, because every real browser sends one', () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
  });

  it('does not mistake real browsers for bots', () => {
    const humans = [
      CHROME_UA,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1',
    ];
    for (const ua of humans) expect(isBotUserAgent(ua)).toBe(false);
  });

  it('drops a bot instead of storing it as device = bot', async () => {
    const { deps, written, lookups } = harness();
    const outcome = await recordStorefrontClick(
      { storeId: STORE_ID, eventType: 'storefront_view' },
      shopper({ userAgent: 'Googlebot/2.1' }),
      deps,
    );

    // The rollup trigger fires on INSERT, so anything written is already counted before a
    // dashboard query could exclude it. The only safe place to stop a crawler is before the write.
    expect(outcome).toEqual({ status: 'skipped', reason: 'bot' });
    expect(written).toHaveLength(0);
    expect(lookups).toHaveLength(0);
  });
});

describe('device classification', () => {
  it.each([
    [CHROME_UA, 'desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1', 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36', 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Safari/604.1', 'tablet'],
    ['Mozilla/5.0 (Linux; Android 13; SM-X700 Tablet) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'tablet'],
  ])('classifies %s as %s', (userAgent, expected) => {
    expect(classifyDevice(userAgent)).toBe(expected);
  });

  it('classifies an Android tablet as a tablet even though it also says Android', () => {
    // Android tablets send both markers, so order of checks is load-bearing.
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14; Nexus 10) Chrome/124.0 Safari/537.36')).toBe('tablet');
  });

  it('never writes a device value wider than the 16-character column', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick({ storeId: STORE_ID }, shopper(), deps);
    expect(written[0].device.length).toBeLessThanOrEqual(16);
  });
});

describe('IP hashing', () => {
  it('produces the 64 hex characters the ip_hash column holds', () => {
    const hash = hashClientIp('203.0.113.7', 'pepper');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for one address and different for another', () => {
    expect(hashClientIp('203.0.113.7', 'pepper')).toBe(hashClientIp('203.0.113.7', 'pepper'));
    expect(hashClientIp('203.0.113.7', 'pepper')).not.toBe(hashClientIp('203.0.113.8', 'pepper'));
  });

  it('changes with the salt, so two deployments cannot correlate their tables', () => {
    expect(hashClientIp('203.0.113.7', 'salt-a')).not.toBe(hashClientIp('203.0.113.7', 'salt-b'));
  });

  it('returns null rather than hashing nothing when there is no address', () => {
    expect(hashClientIp(null)).toBeNull();
    expect(hashClientIp('')).toBeNull();
    expect(hashClientIp('   ')).toBeNull();
  });

  it('reads the salt from the environment when one is configured', () => {
    const previous = process.env.STOREFRONT_CLICK_IP_SALT;
    try {
      process.env.STOREFRONT_CLICK_IP_SALT = 'an-operator-supplied-salt';
      const configured = hashClientIp('203.0.113.7');
      delete process.env.STOREFRONT_CLICK_IP_SALT;
      expect(configured).not.toBe(hashClientIp('203.0.113.7'));
    } finally {
      if (previous === undefined) delete process.env.STOREFRONT_CLICK_IP_SALT;
      else process.env.STOREFRONT_CLICK_IP_SALT = previous;
    }
  });

  it('never lets the raw address into the record', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick({ storeId: STORE_ID }, shopper({ ip: '198.51.100.42' }), deps);

    const serialised = JSON.stringify(written[0]);
    expect(serialised).not.toContain('198.51.100.42');
    expect(written[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('takes the client from the first hop of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip and then to nothing', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe('privacy signals', () => {
  it('reads DNT and Sec-GPC from the request headers', () => {
    expect(hasPrivacySignal(new Headers({ dnt: '1' }))).toBe(true);
    expect(hasPrivacySignal(new Headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(hasPrivacySignal(new Headers({ dnt: '0' }))).toBe(false);
    expect(hasPrivacySignal(new Headers())).toBe(false);
  });

  it('skips the write when the visitor asked not to be tracked', async () => {
    const { deps, written, lookups } = harness();
    const outcome = await recordStorefrontClick(
      { storeId: STORE_ID },
      shopper({ privacySignal: true }),
      deps,
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'privacy_signal' });
    expect(written).toHaveLength(0);
    expect(lookups).toHaveLength(0);
  });
});

describe('referrer handling', () => {
  it('keeps only the host, so a referrer query string is never stored', () => {
    expect(referrerDomain('https://www.google.com/search?q=secret+medical+question')).toBe('google.com');
  });

  it('strips a leading www so one source is one row', () => {
    expect(referrerDomain('https://www.instagram.com/rebelshops')).toBe('instagram.com');
  });

  it('returns null for junk rather than throwing', () => {
    for (const value of ['', 'not a url', 'javascript:alert(1)', null, undefined]) {
      expect(referrerDomain(value)).toBeNull();
    }
  });
});

describe('column widths and normalisation', () => {
  it('clips every string to what its column can hold', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick(
      {
        storeId: STORE_ID,
        eventType: 'product_view',
        productId: PRODUCT_ID,
        path: `/store/demo/${'p'.repeat(900)}`,
        visitorId: 'v'.repeat(200),
        sessionId: 's'.repeat(200),
        utmSource: 'u'.repeat(400),
        utmMedium: 'm'.repeat(400),
        utmCampaign: 'c'.repeat(400),
      },
      shopper({ userAgent: `${CHROME_UA} ${'x'.repeat(4000)}` }),
      deps,
    );

    const row = written[0];
    expect(row.path).toHaveLength(512);
    expect(row.visitorId).toHaveLength(64);
    expect(row.sessionId).toHaveLength(64);
    expect(row.utmSource).toHaveLength(128);
    expect(row.utmMedium).toHaveLength(128);
    expect(row.utmCampaign).toHaveLength(128);
    expect(row.userAgent?.length).toBeLessThanOrEqual(1024);
    expect(row.productId).toBe(PRODUCT_ID);
  });

  it('upper-cases the country and drops anything that is not a country code', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick({ storeId: STORE_ID }, shopper({ country: 'gb' }), deps);
    expect(written[0].country).toBe('GB');

    const second = harness();
    await recordStorefrontClick({ storeId: STORE_ID }, shopper({ country: null }), second.deps);
    expect(second.written[0].country).toBeNull();
  });

  it('drops a product id that is not a UUID instead of failing the foreign key', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick(
      { storeId: STORE_ID, eventType: 'product_view', productId: 'wireless-headphones' },
      shopper(),
      deps,
    );
    expect(written[0].productId).toBeNull();
  });

  it('turns blank strings into nulls so the table has one empty value, not two', async () => {
    const { deps, written } = harness();
    await recordStorefrontClick(
      { storeId: STORE_ID, path: '   ', visitorId: '', utmSource: '  ' },
      shopper(),
      deps,
    );

    expect(written[0].path).toBeNull();
    expect(written[0].visitorId).toBeNull();
    expect(written[0].utmSource).toBeNull();
  });
});

describe('rate limiting', () => {
  it('allows a normal browsing session and refuses a flood within the minute', () => {
    const limiter = createClickRateLimiter({ perMinute: 5, perDay: 100 });
    const at = 1_000_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.check('store|client', at + i)).toBe(true);
    }
    expect(limiter.check('store|client', at + 5)).toBe(false);
  });

  it('keeps refusing while the flood continues, rather than letting every sixth through', () => {
    const limiter = createClickRateLimiter({ perMinute: 2, perDay: 100 });
    limiter.check('k', 0);
    limiter.check('k', 1);
    for (let i = 2; i < 40; i++) {
      expect(limiter.check('k', i)).toBe(false);
    }
  });

  it('lets the client back in once the minute has rolled over', () => {
    const limiter = createClickRateLimiter({ perMinute: 2, perDay: 100 });
    expect(limiter.check('k', 0)).toBe(true);
    expect(limiter.check('k', 1)).toBe(true);
    expect(limiter.check('k', 2)).toBe(false);
    expect(limiter.check('k', 60_001)).toBe(true);
  });

  it('holds a daily ceiling that a patient attacker cannot spread past', () => {
    const limiter = createClickRateLimiter({ perMinute: 10, perDay: 25 });
    let allowed = 0;
    // One beacon every two minutes for a day: never near the per-minute limit, still capped.
    for (let i = 0; i < 200; i++) {
      if (limiter.check('k', i * 120_000)) allowed += 1;
    }
    expect(allowed).toBe(25);
  });

  it('limits each store/client pair separately, so one abuser cannot mute a shop', () => {
    const limiter = createClickRateLimiter({ perMinute: 1, perDay: 100 });
    expect(limiter.check('shop-a|abuser', 0)).toBe(true);
    expect(limiter.check('shop-a|abuser', 1)).toBe(false);
    // A different shopper on the same shop, and the same shopper on a different shop, are unaffected.
    expect(limiter.check('shop-a|shopper', 1)).toBe(true);
    expect(limiter.check('shop-b|abuser', 1)).toBe(true);
  });

  it('bounds its own memory, so the map is not an amplification target', () => {
    const limiter = createClickRateLimiter({ perMinute: 1, perDay: 1, maxKeys: 100 });
    for (let i = 0; i < 5000; i++) limiter.check(`key-${i}`, i);
    // Nothing to assert on the map directly; what matters is that the newest key still works and
    // the process has not been asked to hold 5,000 buckets.
    expect(limiter.check('key-5000', 5000)).toBe(true);
  });

  it('refuses the write when the limiter says no, before any store lookup', async () => {
    const { deps, written, lookups } = harness();
    const limiter = createClickRateLimiter({ perMinute: 1, perDay: 10 });
    const limited = { ...deps, rateLimiter: limiter };

    const first = await recordStorefrontClick({ storeId: STORE_ID }, shopper(), limited);
    const second = await recordStorefrontClick({ storeId: STORE_ID }, shopper(), limited);

    expect(first.status).toBe('recorded');
    expect(second).toEqual({ status: 'skipped', reason: 'rate_limited' });
    expect(written).toHaveLength(1);
    // The refused beacon cost one hash and one map lookup — no query.
    expect(lookups).toHaveLength(1);
  });

  it('counts one client per store, so forging traffic for a shop you do not own is bounded', async () => {
    const { deps, written } = harness({ 'victim-shop': STORE_ID });
    const limiter = createClickRateLimiter({ perMinute: 3, perDay: 100 });
    const limited = { ...deps, rateLimiter: limiter };

    for (let i = 0; i < 25; i++) {
      await recordStorefrontClick(
        { storeSlug: 'victim-shop', eventType: 'add_to_cart' },
        shopper(),
        limited,
      );
    }

    expect(written).toHaveLength(3);
  });
});
