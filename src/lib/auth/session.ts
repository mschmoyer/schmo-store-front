import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const JWT_ISSUER = 'schmo-store';
const JWT_AUDIENCE = 'schmo-store-users';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const secret = new TextEncoder().encode(JWT_SECRET);

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
    .sign(secret);
  
  return jwt;
}

export async function verifySession(sessionToken: string): Promise<UserSession | null> {
  try {
    // Verify JWT token
    const { payload } = await jwtVerify(sessionToken, secret, {
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
  
  // Also check for session cookie
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('session='));
    if (sessionCookie) {
      const token = sessionCookie.split('=')[1];
      return await verifySession(token);
    }
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
  const user = await getSessionFromRequest(request);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}