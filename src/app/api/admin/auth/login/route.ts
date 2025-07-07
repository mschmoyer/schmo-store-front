import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const { email, password } = LoginSchema.parse(body);
    
    // Find user by email
    const userResult = await db.query(`
      SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.is_active,
             s.id as store_id, s.store_name, s.store_slug, s.store_description, s.theme_name
      FROM users u
      LEFT JOIN stores s ON u.id = s.owner_id
      WHERE u.email = $1 AND u.is_active = true
    `, [email]);
    
    if (userResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email or password'
      }, { status: 401 });
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = userResult.rows[0] as any;
    
    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email or password'
      }, { status: 401 });
    }
    
    // Check if user has a store
    if (!user.store_id) {
      return NextResponse.json({
        success: false,
        error: 'No store found for this user'
      }, { status: 404 });
    }
    
    // Create session
    const sessionToken = await createSession({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      storeId: user.store_id,
      storeSlug: user.store_slug,
      storeName: user.store_name
    });
    
    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          storeId: user.store_id,
          store: {
            id: user.store_id,
            name: user.store_name,
            slug: user.store_slug,
            description: user.store_description,
            theme: user.theme_name
          }
        },
        session: {
          id: user.id,
          storeId: user.store_id,
          sessionToken: sessionToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}