import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { hashPassword } from '@/lib/auth/password';
import { v4 as uuidv4 } from 'uuid';

interface CreateStoreRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string;
  heroTitle: string;
  heroDescription: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateStoreRequest = await req.json();
    
    // Validate required fields
    const requiredFields = ['email', 'password', 'firstName', 'lastName', 'storeName', 'storeSlug', 'storeDescription', 'heroTitle', 'heroDescription'];
    const missingFields = requiredFields.filter(field => !body[field as keyof CreateStoreRequest]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { message: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if email already exists (exact match only)
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [body.email]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { message: 'Email already exists' },
        { status: 400 }
      );
    }

    // Check if store slug already exists
    const existingStore = await db.query(
      'SELECT id FROM stores WHERE store_slug = $1',
      [body.storeSlug]
    );

    if (existingStore.rows.length > 0) {
      return NextResponse.json(
        { message: 'Store slug already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(body.password);

    // Create user and store in a transaction
    const result = await db.transaction(async (client) => {
      // Create user
      const userId = uuidv4();
      await client.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, email_verified, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, body.email, hashedPassword, body.firstName, body.lastName, false, true]
      );

      // Create store
      const storeId = uuidv4();
      await client.query(
        `INSERT INTO stores (id, owner_id, store_name, store_slug, store_description, hero_title, hero_description, theme_name, currency, is_active, is_public, allow_guest_checkout, meta_title, meta_description) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          storeId,
          userId,
          body.storeName,
          body.storeSlug,
          body.storeDescription,
          body.heroTitle,
          body.heroDescription,
          'default',
          'USD',
          true,
          true,
          true,
          body.storeName,
          body.storeDescription
        ]
      );

      return { userId, storeId };
    });

    return NextResponse.json({
      message: 'Store created successfully',
      userId: result.userId,
      storeId: result.storeId,
      storeSlug: body.storeSlug,
      storeName: body.storeName
    });

  } catch (error) {
    console.error('Error creating store:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}