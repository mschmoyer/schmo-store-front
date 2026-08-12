/**
 * Tests for the real ShipStation credential check.
 *
 * The logic under test — the classification of every outcome into a distinct,
 * actionable merchant-facing result — is exercised directly. Only `fetch` is
 * substituted, and only so a specific HTTP status or transport failure can be
 * produced on demand. `validateShipStationKey` itself is never stubbed.
 */

import {
  DEFAULT_TIMEOUT_MS,
  MIN_KEY_LENGTH,
  SHIPSTATION_PROBE_URL,
  classifyResponse,
  classifyThrown,
  isPlanLimitedBody,
  looksLikeShipStation,
  maskKey,
  validateShipStationKey,
  type FetchLike,
} from '../shipstation';

/** A key long enough to clear the pre-flight. */
const GOOD_KEY = 'TEST_ss_key_0123456789abcdef';

/**
 * Build a fetch that answers with one canned response.
 *
 * @param status - HTTP status to return
 * @param body - JSON body, or `undefined` for a non-JSON response
 * @returns A fetch stand-in plus the calls it recorded
 */
function respondWith(status: number, body?: unknown) {
  const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new SyntaxError('not json');
        return body;
      },
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

describe('looksLikeShipStation', () => {
  it('recognises a ShipStation error envelope', () => {
    expect(looksLikeShipStation({ errors: [] })).toBe(true);
    expect(looksLikeShipStation({ request_id: 'req_1' })).toBe(true);
  });

  it('does not recognise a proxy or firewall answer', () => {
    expect(looksLikeShipStation(null)).toBe(false);
    expect(looksLikeShipStation({ message: 'Host not in allowlist' })).toBe(false);
  });
});

describe('isPlanLimitedBody', () => {
  it('recognises billing, plan, upgrade and subscription wording', () => {
    for (const message of [
      'Your billing plan does not include this',
      'Please upgrade to access warehouses',
      'This plan has no warehouse access',
      'Subscription required',
    ]) {
      expect(isPlanLimitedBody({ errors: [{ message }] })).toBe(true);
    }
  });

  it('does not treat an ordinary auth failure as a plan problem', () => {
    expect(isPlanLimitedBody({ errors: [{ message: 'Unauthorized' }] })).toBe(false);
    expect(isPlanLimitedBody({ errors: [] })).toBe(false);
    expect(isPlanLimitedBody(null)).toBe(false);
  });
});

describe('classifyResponse', () => {
  it('treats 200 as connected and counts the warehouses', () => {
    const result = classifyResponse(200, { warehouses: [{}, {}, {}] });
    expect(result).toMatchObject({ status: 'connected', ok: true, warehouseCount: 3 });
    expect(result.message).toBe('Connected. We can see your ShipStation account.');
  });

  it('handles a 200 with no warehouses without claiming any', () => {
    expect(classifyResponse(200, {})).toMatchObject({ ok: true, warehouseCount: 0 });
  });

  it('lets a plan-limited 401 through, because the key itself is valid', () => {
    const result = classifyResponse(401, {
      errors: [{ message: 'Upgrade your plan to use warehouses' }],
    });
    expect(result.status).toBe('plan_limited');
    expect(result.ok).toBe(true);
  });

  it('blocks a 401 from ShipStation as a rejected key', () => {
    const result = classifyResponse(401, { errors: [{ message: 'Invalid API key' }] });
    expect(result.status).toBe('invalid_key');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ShipStation rejected that key/);
    expect(result.action).toBe('Try again');
  });

  it('distinguishes 403 from 401 with different copy', () => {
    const forbidden = classifyResponse(403, { errors: [{ message: 'Forbidden' }] });
    const unauthorised = classifyResponse(401, { errors: [{ message: 'Unauthorized' }] });
    expect(forbidden.status).toBe('forbidden');
    expect(unauthorised.status).toBe('invalid_key');
    expect(forbidden.message).not.toBe(unauthorised.message);
  });

  it('blames the network, not the key, when a 403 did not come from ShipStation', () => {
    // Exactly what an egress proxy or corporate firewall returns: a plain-text
    // body with no ShipStation envelope. Telling the merchant to regenerate a
    // perfectly good key here would be the audit's mistake in a new costume.
    const result = classifyResponse(403, null);
    expect(result.status).toBe('blocked_upstream');
    expect(result.message).toMatch(/not your key/);
    expect(result.action).toBe('Retry');
  });

  it('treats a bodyless 401 the same way', () => {
    expect(classifyResponse(401, null).status).toBe('blocked_upstream');
  });

  it('still trusts a ShipStation 403 that carries a request_id', () => {
    expect(classifyResponse(403, { request_id: 'abc-123' }).status).toBe('forbidden');
  });

  it('classifies rate limiting separately and offers Retry', () => {
    const result = classifyResponse(429, null);
    expect(result).toMatchObject({ status: 'rate_limited', ok: false, action: 'Retry' });
  });

  it('classifies a 5xx as their problem, not the merchant’s', () => {
    const result = classifyResponse(503, null);
    expect(result.status).toBe('unexpected');
    expect(result.message).toMatch(/on their end/);
    expect(result.action).toBe('Retry');
  });

  it('names the status when it does not recognise the answer', () => {
    expect(classifyResponse(418, null).message).toContain('418');
  });

  it('gives every failure mode a distinct message', () => {
    const messages = [
      classifyResponse(401, { errors: [{ message: 'Unauthorized' }] }),
      classifyResponse(403, { errors: [{ message: 'Forbidden' }] }),
      classifyResponse(403, null),
      classifyResponse(429, null),
      classifyResponse(500, null),
      classifyResponse(418, null),
      classifyThrown(new Error('ECONNREFUSED'), false),
      classifyThrown(new Error('aborted'), true),
    ].map((result) => result.message);
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe('classifyThrown', () => {
  it('reports a transport failure as unreachable, not as a bad key', () => {
    const result = classifyThrown(new Error('getaddrinfo ENOTFOUND api.shipstation.com'), false);
    expect(result.status).toBe('network_error');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn’t reach ShipStation/);
    expect(result.message).toMatch(/your data is untouched/);
    expect(result.action).toBe('Retry');
    expect(result.detail).toContain('ENOTFOUND');
  });

  it('reports our own abort as a timeout', () => {
    expect(classifyThrown(new Error('aborted'), true).status).toBe('timeout');
  });

  it('reports an AbortError as a timeout even without our flag', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    expect(classifyThrown(error, false).status).toBe('timeout');
  });
});

describe('validateShipStationKey', () => {
  it('sends the key in the api-key header to the documented V2 endpoint', async () => {
    const { fetchImpl, calls } = respondWith(200, { warehouses: [] });
    await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SHIPSTATION_PROBE_URL);
    expect(calls[0].headers?.['api-key']).toBe(GOOD_KEY);
  });

  it('trims whitespace off a pasted key before sending it', async () => {
    const { fetchImpl, calls } = respondWith(200, { warehouses: [] });
    await validateShipStationKey(`  ${GOOD_KEY}  `, { fetchImpl });
    expect(calls[0].headers?.['api-key']).toBe(GOOD_KEY);
  });

  it('rejects an empty key without any network call', async () => {
    const { fetchImpl, calls } = respondWith(200, { warehouses: [] });
    const result = await validateShipStationKey('', { fetchImpl });
    expect(result.status).toBe('malformed');
    expect(result.message).toBe('Enter your ShipStation API key');
    expect(calls).toHaveLength(0);
  });

  it('rejects an obviously too-short key without a round trip', async () => {
    const { fetchImpl, calls } = respondWith(200, { warehouses: [] });
    const result = await validateShipStationKey('abc', { fetchImpl });
    expect(result.status).toBe('malformed');
    expect(result.message).toContain('3 characters');
    expect(calls).toHaveLength(0);
  });

  it('rejects a key containing whitespace, which is the usual paste accident', async () => {
    const { fetchImpl } = respondWith(200, { warehouses: [] });
    const key = `${GOOD_KEY.slice(0, 12)} ${GOOD_KEY.slice(12)}`;
    const result = await validateShipStationKey(key, { fetchImpl });
    expect(result.status).toBe('malformed');
    expect(result.message).toMatch(/contains a space/);
  });

  it('never accepts a key on pre-flight alone — the length rule can only reject', async () => {
    // The audit's exact counter-example: 32 characters of filler that the old
    // "test connection" screen passed as "ready for integration".
    const filler = 'a'.repeat(32);
    expect(filler.length).toBeGreaterThan(MIN_KEY_LENGTH);
    const { fetchImpl } = respondWith(401, { errors: [{ message: 'Invalid API key' }] });
    const result = await validateShipStationKey(filler, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid_key');
  });

  it('reports a rejected key', async () => {
    const { fetchImpl } = respondWith(401, { errors: [{ message: 'Unauthorized' }] });
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(result).toMatchObject({ status: 'invalid_key', ok: false, httpStatus: 401 });
  });

  it('lets a valid key on a limited plan continue', async () => {
    const { fetchImpl } = respondWith(401, {
      errors: [{ message: 'Your plan does not include warehouse access' }],
    });
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(result).toMatchObject({ status: 'plan_limited', ok: true });
  });

  it('handles a network failure — the branch this machine can actually exercise', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(result).toMatchObject({ status: 'network_error', ok: false, action: 'Retry' });
    expect(result.httpStatus).toBeUndefined();
  });

  it('times out rather than hanging, and says so', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl, timeoutMs: 5 });
    expect(result.status).toBe('timeout');
    expect(result.ok).toBe(false);
  });

  it('recognises the local egress proxy blocking the host', async () => {
    // This is the branch this machine actually exercises: the sandbox proxy
    // answers 403 text/plain for api.shipstation.com.
    const { fetchImpl } = respondWith(403);
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(result.status).toBe('blocked_upstream');
    expect(result.ok).toBe(false);
  });

  it('survives a response that is not JSON at all', async () => {
    const { fetchImpl } = respondWith(502);
    const result = await validateShipStationKey(GOOD_KEY, { fetchImpl });
    expect(result.status).toBe('unexpected');
    expect(result.ok).toBe(false);
  });

  it('never throws, whatever fetch does', async () => {
    const fetchImpl: FetchLike = async () => {
      throw 'a string, not an Error';
    };
    await expect(validateShipStationKey(GOOD_KEY, { fetchImpl })).resolves.toMatchObject({
      ok: false,
    });
  });

  it('defaults to a ten-second budget', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});

describe('maskKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('abcdefghijklmnop')).toBe('••••••••mnop');
  });

  it('reveals nothing at all for a very short value', () => {
    expect(maskKey('abc')).toBe('••••••••');
  });

  it('never contains the key it was given', () => {
    const key = 'super-secret-shipstation-key';
    expect(maskKey(key)).not.toContain('super');
  });
});
