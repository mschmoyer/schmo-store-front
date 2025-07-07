import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: LoginRequest = await req.json();
    
    // Validate required fields
    if (!body.email || !body.password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Get user from database
    const userResult = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.is_active,
              s.id as store_id, s.store_slug, s.store_name
       FROM users u
       LEFT JOIN stores s ON u.id = s.owner_id
       WHERE u.email = $1`,
      [body.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { message: 'Account is disabled' },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(body.password, String(user.password_hash));
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session token
    const sessionToken = await createSession({
      userId: String(user.id),
      email: String(user.email),
      firstName: String(user.first_name),
      lastName: String(user.last_name),
      storeId: user.store_id ? String(user.store_id) : undefined,
      storeSlug: user.store_slug ? String(user.store_slug) : undefined,
      storeName: user.store_name ? String(user.store_name) : undefined
    });

    // Create response with token
    const response = NextResponse.json({
      message: 'Login successful',
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      store: user.store_id ? {
        id: user.store_id,
        slug: user.store_slug,
        name: user.store_name
      } : null,
      storeSlug: user.store_slug
    });

    // Set session cookie
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}