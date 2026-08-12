/**
 * Preview tokens for the customizer iframe (spec section 10).
 *
 * The customizer renders the *real* storefront at `/store/{slug}?preview=<token>`
 * so what a merchant sees is what ships. That URL serves the **draft** theme,
 * which means it must never be reachable without proof of authorisation:
 * "drafts must never be viewable without one".
 *
 * Tokens are short-lived, signed with the app's existing `JWT_SECRET` via `jose`
 * (the same library and secret `src/lib/auth/session.ts` uses), and scoped to a
 * single store id. A token minted for store A cannot preview store B.
 */

import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const ISSUER = 'rebelshops-storefront';
const AUDIENCE = 'rebelshops-storefront-preview';
const TOKEN_TYPE = 'storefront_preview';

/** Default token lifetime. Long enough for a customizing session, short enough to matter. */
export const PREVIEW_TOKEN_TTL_SECONDS = 30 * 60;

/** Upper bound on a requested lifetime. */
export const PREVIEW_TOKEN_MAX_TTL_SECONDS = 4 * 60 * 60;

const secret = new TextEncoder().encode(JWT_SECRET);

export interface PreviewTokenClaims {
  /** The store this token may preview. */
  storeId: string;
  /** The user the token was minted for, when known. */
  userId?: string;
  /** Expiry, seconds since epoch. */
  expiresAt: number;
}

export interface MintPreviewTokenOptions {
  /** Lifetime in seconds. Clamped to `PREVIEW_TOKEN_MAX_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Owner of the customizing session, recorded for auditing. */
  userId?: string;
}

/**
 * Mint a signed preview token scoped to one store.
 * @param storeId - The store the token grants draft access to
 * @param options - Lifetime and optional user id
 * @returns A compact JWS string to place in the `?preview=` query parameter
 */
export async function mintPreviewToken(
  storeId: string,
  options: MintPreviewTokenOptions = {},
): Promise<string> {
  if (!storeId) throw new Error('mintPreviewToken requires a storeId');

  const ttl = Math.min(
    Math.max(60, options.ttlSeconds ?? PREVIEW_TOKEN_TTL_SECONDS),
    PREVIEW_TOKEN_MAX_TTL_SECONDS,
  );
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  return new SignJWT({
    storeId,
    ...(options.userId ? { userId: options.userId } : {}),
    type: TOKEN_TYPE,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(secret);
}

/**
 * Verify a preview token.
 *
 * Returns null for anything that is not a valid, unexpired, correctly-scoped
 * preview token — including tokens minted for a different purpose that happen to
 * be signed with the same secret, which is why `type`, `iss` and `aud` are all
 * checked.
 *
 * @param token - The raw token from the query string
 * @returns The claims, or null when the token is unusable
 */
export async function verifyPreviewToken(
  token: string | null | undefined,
): Promise<PreviewTokenClaims | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (payload.type !== TOKEN_TYPE) return null;
    if (typeof payload.storeId !== 'string' || payload.storeId.length === 0) return null;

    return {
      storeId: payload.storeId,
      ...(typeof payload.userId === 'string' ? { userId: payload.userId } : {}),
      expiresAt: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    // A bad token is an ordinary condition, not an error worth logging on every
    // public storefront request.
    return null;
  }
}

/**
 * The check the storefront layout performs before serving a draft.
 *
 * Call this with the store being rendered and the `?preview=` value. Only when
 * it returns true may the layout read the draft row instead of the published one.
 *
 * @param storeId - The store about to be rendered
 * @param token - The `?preview=` query parameter, if present
 * @returns True when the token authorises draft access to exactly this store
 */
export async function isPreviewAuthorized(
  storeId: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!storeId) return false;
  const claims = await verifyPreviewToken(token);
  return claims !== null && claims.storeId === storeId;
}

/**
 * Build the customizer's iframe URL for a store.
 * @param slug - The store slug
 * @param token - A preview token from `mintPreviewToken`
 * @returns A relative URL such as `/store/demo-electronics?preview=…`
 */
export function previewUrl(slug: string, token: string): string {
  return `/store/${encodeURIComponent(slug)}?preview=${encodeURIComponent(token)}`;
}
