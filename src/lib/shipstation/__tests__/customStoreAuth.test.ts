/**
 * @jest-environment node
 */

/**
 * Tests for Custom Store Basic authentication.
 *
 * @channel custom-store
 *
 * Scope note: the pure functions are tested here for real. The database-backed functions
 * (`issueCustomStoreCredentials`, `authenticateCustomStoreRequest`) are exercised end-to-end by
 * `npm run verify:custom-store` against a running instance, which is the only thing that can prove
 * a credential the server issued is one the server will then accept. Mocking `db` here would test
 * the mock, not the round trip that keeps producing bugs.
 */

import {
  buildCustomStoreUsername,
  generateCustomStoreSecret,
  parseBasicAuthHeader,
} from '../customStoreAuth';

describe('parseBasicAuthHeader', () => {
  /** Encode a pair the way a client does, so the test exercises real input. */
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  it('decodes a well-formed header', () => {
    expect(parseBasicAuthHeader(basic('store_abc', 's3cret'))).toEqual({
      username: 'store_abc',
      password: 's3cret',
    });
  });

  it('keeps colons in the password, splitting only on the first', () => {
    // A base64url secret will not contain a colon, but a merchant-supplied one might, and
    // splitting on every colon would silently reject a valid credential.
    expect(parseBasicAuthHeader(basic('user', 'a:b:c'))).toEqual({
      username: 'user',
      password: 'a:b:c',
    });
  });

  it('returns null rather than throwing for unusable headers', () => {
    expect(parseBasicAuthHeader(null)).toBeNull();
    expect(parseBasicAuthHeader('')).toBeNull();
    expect(parseBasicAuthHeader('Bearer sometoken')).toBeNull();
    expect(parseBasicAuthHeader('Basic')).toBeNull();
    expect(parseBasicAuthHeader('Basic !!!not-base64!!!')).toBeNull();
    // Decodes, but carries no separator.
    expect(parseBasicAuthHeader(`Basic ${Buffer.from('nocolon').toString('base64')}`)).toBeNull();
    // Empty username is not a credential.
    expect(parseBasicAuthHeader(basic('', 'secret'))).toBeNull();
  });

  it('refuses an absurdly long header without decoding it', () => {
    expect(parseBasicAuthHeader(`Basic ${'A'.repeat(5000)}`)).toBeNull();
  });

  it('accepts an empty password so the comparison, not the parser, rejects it', () => {
    // Rejecting here would make "no password" fail differently from "wrong password", which is a
    // distinction an unauthenticated caller must not be able to observe.
    expect(parseBasicAuthHeader(basic('user', ''))).toEqual({ username: 'user', password: '' });
  });
});

describe('buildCustomStoreUsername', () => {
  it('is stable for a given store', () => {
    const id = '650e8400-e29b-41d4-a716-446655440001';
    expect(buildCustomStoreUsername(id)).toBe(buildCustomStoreUsername(id));
  });

  it('does not collide between UUIDs that share a long prefix', () => {
    // Regression. An earlier version truncated to 16 hex characters, and UUIDs minted in a batch
    // commonly differ only at the end — these two seeded stores both derived
    // `store_650e8400e29b41d4`. Whichever issued credentials second would have claimed the first
    // store's username and then served its orders.
    const a = buildCustomStoreUsername('650e8400-e29b-41d4-a716-446655440001');
    const b = buildCustomStoreUsername('650e8400-e29b-41d4-a716-446655440002');
    expect(a).not.toBe(b);
  });

  it('produces a username safe to send in a Basic auth header', () => {
    const username = buildCustomStoreUsername('650e8400-e29b-41d4-a716-446655440001');
    expect(username).toMatch(/^store_[0-9a-f]{32}$/);
    // A colon would be swallowed by the header format.
    expect(username).not.toContain(':');
  });
});

describe('generateCustomStoreSecret', () => {
  it('returns a fresh, URL-safe secret every call', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateCustomStoreSecret()));
    expect(secrets.size).toBe(50);
    for (const secret of secrets) {
      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries at least 24 bytes of entropy', () => {
    // base64url of 24 bytes is 32 characters with no padding.
    expect(generateCustomStoreSecret()).toHaveLength(32);
  });
});
