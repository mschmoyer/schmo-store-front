import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { getJwtSecret } from '@/lib/auth/jwt-secret';

// The cookie name and its clearing helper live in `./session-cookie` so routes that only expire a
// cookie need not pull `jose` in with them. Re-exported here because this is where callers look.
export { SESSION_COOKIE, clearSessionCookie } from './session-cookie';


const JWT_ISSUER = 'schmo-store';
const JWT_AUDIENCE = 'schmo-store-users';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * The signing key, encoded on first use rather than at module load.
 *
 * Lazy because `getJwtSecret()` throws on a missing or placeholder secret, and
 * a throw at module scope fires wherever the module is merely imported —
 * including client bundles that only want a type from here. See
 * `jwt-secret.ts` for the customizer regression that taught us this.
 *
 * @returns The secret as bytes, ready for `jose`
 */
function secretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export interface UserSession {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  storeId?: string;
  storeSlug?: string;
  storeName?: string;
}

export async function createSession(userData: UserSession): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);
  
  // Create JWT token
  const jwt = await new SignJWT({ 
    sessionId, 
    userId: userData.userId,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    storeId: userData.storeId,
    storeSlug: userData.storeSlug,
    storeName: userData.storeName,
    type: 'user_session' 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(secretBytes());
  
  return jwt;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function destroySession(_sessionToken: string): Promise<void> {
  // For JWT tokens, we can't actually destroy them server-side
  // The client should remove the token from storage
  // In a production environment, you might want to maintain a blacklist
  // or use shorter expiration times
  return Promise.resolve();
}

export async function verifySession(sessionToken: string): Promise<UserSession | null> {
  try {
    // Verify JWT token
    const { payload } = await jwtVerify(sessionToken, secretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      firstName: payload.firstName as string,
      lastName: payload.lastName as string,
      storeId: payload.storeId as string,
      storeSlug: payload.storeSlug as string,
      storeName: payload.storeName as string
    };
  } catch (error) {
    console.error('Session verification failed:', error);
    return null;
  }
}

export async function getSessionFromRequest(request: Request): Promise<UserSession | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return await verifySession(token);
  }
  
  return null;
}

export async function getSessionFromCookies(cookieHeader: string): Promise<UserSession | null> {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));
  
  if (!sessionCookie) return null;
  
  const token = sessionCookie.split('=')[1];
  return await verifySession(token);
}

// Middleware function to verify user session
export async function requireAuth(request: Request): Promise<UserSession> {
  // Try Authorization header first (Bearer token)
  let user = await getSessionFromRequest(request);
  
  // If no Bearer token, try cookies
  if (!user) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      user = await getSessionFromCookies(cookieHeader);
    }
  }
  
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}