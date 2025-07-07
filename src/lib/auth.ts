import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { 
  User, 
  AuthSession, 
  JWTPayload, 
  LoginCredentials, 
  RegisterCredentials,
  AuthResponse,
  SessionData
} from '@/types/auth';

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// Cookie configuration
export const AUTH_COOKIE_NAME = 'auth-token';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
  };

  return jwt.sign(payload, JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Get the current user from the request
 */
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    
    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // In a real app, you'd fetch the user from the database
    // For now, we'll return a mock user based on the token payload
    return {
      id: payload.userId,
      email: payload.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      emailVerified: true,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Get the current session from server-side cookies
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    
    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // In a real app, you'd fetch the user from the database
    const user: User = {
      id: payload.userId,
      email: payload.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      emailVerified: true,
    };

    return {
      user,
      token,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * Create a new session and set the auth cookie
 */
export async function createSession(user: User): Promise<string> {
  const token = generateToken(user);
  
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  
  return token;
}

/**
 * Clear the auth session
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Validate login credentials
 */
export function validateLoginCredentials(credentials: LoginCredentials): string[] {
  const errors: string[] = [];

  if (!credentials.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(credentials.email)) {
    errors.push('Invalid email format');
  }

  if (!credentials.password) {
    errors.push('Password is required');
  } else if (credentials.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return errors;
}

/**
 * Validate registration credentials
 */
export function validateRegisterCredentials(credentials: RegisterCredentials): string[] {
  const errors: string[] = [];

  if (!credentials.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(credentials.email)) {
    errors.push('Invalid email format');
  }

  if (!credentials.password) {
    errors.push('Password is required');
  } else if (credentials.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  } else if (!isStrongPassword(credentials.password)) {
    errors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
  }

  if (!credentials.confirmPassword) {
    errors.push('Password confirmation is required');
  } else if (credentials.password !== credentials.confirmPassword) {
    errors.push('Passwords do not match');
  }

  return errors;
}

/**
 * Check if email format is valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if password is strong enough
 */
export function isStrongPassword(password: string): boolean {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasMinLength = password.length >= 8;

  return hasUppercase && hasLowercase && hasNumber && hasMinLength;
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Check if the current session is valid
 */
export async function isSessionValid(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  
  const now = new Date();
  return session.expiresAt > now;
}

/**
 * Refresh the current session
 */
export async function refreshSession(): Promise<AuthSession | null> {
  const currentSession = await getSession();
  if (!currentSession) return null;

  // Generate a new token
  const newToken = generateToken(currentSession.user);
  
  // Update the cookie
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, newToken, COOKIE_OPTIONS);

  return {
    user: currentSession.user,
    token: newToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };
}

/**
 * Get user ID from token
 */
export function getUserIdFromToken(token: string): string | null {
  const payload = verifyToken(token);
  return payload?.userId || null;
}

/**
 * Format auth response
 */
export function formatAuthResponse(
  success: boolean,
  user?: User,
  token?: string,
  message?: string,
  error?: string
): AuthResponse {
  return {
    success,
    user,
    token,
    message,
    error,
  };
}

/**
 * Create session data from user
 */
export function createSessionData(user: User, token: string): SessionData {
  const payload = verifyToken(token);
  const expiresAt = payload ? new Date(payload.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    user,
    token,
    expiresAt,
  };
}

/**
 * Check if user is authenticated from request
 */
export function isAuthenticated(request: NextRequest): boolean {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return false;

  const payload = verifyToken(token);
  return payload !== null;
}

/**
 * Extract bearer token from authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}

/**
 * Get user from authorization header or cookie
 */
export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  // Try bearer token first
  const bearerToken = extractBearerToken(request);
  if (bearerToken) {
    const payload = verifyToken(bearerToken);
    if (payload) {
      return {
        id: payload.userId,
        email: payload.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        emailVerified: true,
      };
    }
  }

  // Fall back to cookie
  return await getCurrentUser(request);
}