/**
 * Preview token tests.
 *
 * "Drafts must never be viewable without one" (spec section 10), so the failure
 * modes matter more than the happy path.
 */

import jwt from 'jsonwebtoken';

import {
  PREVIEW_TOKEN_MAX_TTL_SECONDS,
  isPreviewAuthorized,
  mintPreviewToken,
  previewUrl,
  verifyPreviewToken,
} from '../preview';

const STORE_A = '650e8400-e29b-41d4-a716-446655440001';
const STORE_B = '650e8400-e29b-41d4-a716-446655440002';

const SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const ISSUER = 'rebelshops-storefront';
const AUDIENCE = 'rebelshops-storefront-preview';

describe('mint and verify', () => {
  it('round-trips a token scoped to one store', async () => {
    const token = await mintPreviewToken(STORE_A);
    const claims = await verifyPreviewToken(token);
    expect(claims?.storeId).toBe(STORE_A);
  });

  it('records the user when given one', async () => {
    const claims = await verifyPreviewToken(await mintPreviewToken(STORE_A, { userId: 'u1' }));
    expect(claims?.userId).toBe('u1');
  });

  it('clamps an absurd requested lifetime', async () => {
    const claims = await verifyPreviewToken(
      await mintPreviewToken(STORE_A, { ttlSeconds: 60 * 60 * 24 * 365 }),
    );
    const ttl = (claims?.expiresAt ?? 0) - Math.floor(Date.now() / 1000);
    expect(ttl).toBeLessThanOrEqual(PREVIEW_TOKEN_MAX_TTL_SECONDS + 5);
  });

  it('enforces a minimum lifetime rather than minting an already-dead token', async () => {
    const claims = await verifyPreviewToken(await mintPreviewToken(STORE_A, { ttlSeconds: 0 }));
    expect((claims?.expiresAt ?? 0) - Math.floor(Date.now() / 1000)).toBeGreaterThan(0);
  });

  it('requires a store id', async () => {
    await expect(mintPreviewToken('')).rejects.toThrow();
  });
});

describe('rejection', () => {
  it('rejects empty, malformed and oversized tokens', async () => {
    for (const token of ['', 'not.a.token', 'a'.repeat(5000)]) {
      expect(await verifyPreviewToken(token)).toBeNull();
    }
    expect(await verifyPreviewToken(null)).toBeNull();
    expect(await verifyPreviewToken(undefined)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const foreign = jwt.sign({ storeId: STORE_A, type: 'storefront_preview' }, 'another-secret', {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(foreign)).toBeNull();
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const unsigned = jwt.sign({ storeId: STORE_A, type: 'storefront_preview' }, '', {
      algorithm: 'none',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(unsigned)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      {
        storeId: STORE_A,
        type: 'storefront_preview',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      SECRET,
      { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE },
    );
    expect(await verifyPreviewToken(expired)).toBeNull();
  });

  it('rejects a token minted for a different audience', async () => {
    const wrongAudience = jwt.sign({ storeId: STORE_A, type: 'storefront_preview' }, SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: 'somewhere-else',
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(wrongAudience)).toBeNull();
  });

  it('rejects a session token that happens to share the signing secret', async () => {
    const session = jwt.sign({ userId: 'u1', type: 'user_session', storeId: STORE_A }, SECRET, {
      algorithm: 'HS256',
      issuer: 'schmo-store',
      audience: 'schmo-store-users',
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(session)).toBeNull();
  });

  it('rejects a correctly-signed token with the wrong type claim', async () => {
    const wrongType = jwt.sign({ storeId: STORE_A, type: 'something_else' }, SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(wrongType)).toBeNull();
  });

  it('rejects a correctly-signed token with no store id', async () => {
    const noStore = jwt.sign({ type: 'storefront_preview' }, SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 3600,
    });
    expect(await verifyPreviewToken(noStore)).toBeNull();
  });
});

describe('isPreviewAuthorized', () => {
  it('authorises only the store the token was minted for', async () => {
    const token = await mintPreviewToken(STORE_A);
    expect(await isPreviewAuthorized(STORE_A, token)).toBe(true);
    expect(await isPreviewAuthorized(STORE_B, token)).toBe(false);
  });

  it('refuses when no token is supplied', async () => {
    expect(await isPreviewAuthorized(STORE_A, null)).toBe(false);
    expect(await isPreviewAuthorized(STORE_A, undefined)).toBe(false);
    expect(await isPreviewAuthorized(STORE_A, '')).toBe(false);
  });

  it('refuses when no store is supplied', async () => {
    expect(await isPreviewAuthorized('', await mintPreviewToken(STORE_A))).toBe(false);
  });
});

describe('previewUrl', () => {
  it('builds an encoded relative url', () => {
    expect(previewUrl('demo-electronics', 'abc.def')).toBe(
      '/store/demo-electronics?preview=abc.def',
    );
  });

  it('encodes hostile slugs and tokens', () => {
    expect(previewUrl('a/b', 'x&y=1')).toBe('/store/a%2Fb?preview=x%26y%3D1');
  });
});
