import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const active_only = searchParams.get('active_only') === 'true';

    let sqlQuery = `
      SELECT 
        id,
        name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        zip,
        country,
        tax_id,
        payment_terms,
        notes,
        is_active,
        performance_rating,
        total_orders,
        on_time_delivery_rate,
        created_at,
        updated_at
      FROM suppliers 
      WHERE store_id = $1
    `;

    const params = [user.storeId];

    if (active_only) {
      sqlQuery += ' AND is_active = true';
    }

    sqlQuery += ' ORDER BY name ASC';

    const result = await query(sqlQuery, params);

    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error in suppliers GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }

    const body = await request.json();
    const { 
      name, 
      contact_person, 
      email, 
      phone, 
      address,
      city,
      state,
      zip,
      country,
      tax_id,
      payment_terms, 
      notes,
      is_active = true
    } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json({ 
        error: 'Supplier name is required' 
      }, { status: 400 });
    }

    // Check for duplicate supplier name in the same store
    const duplicateCheck = await query(
      'SELECT id FROM suppliers WHERE store_id = $1 AND LOWER(name) = LOWER($2)',
      [user.storeId, name]
    );

    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        error: 'A supplier with this name already exists'
      }, { status: 409 });
    }

    // Insert new supplier
    const insertQuery = `
      INSERT INTO suppliers (
        store_id, name, contact_person, email, phone, address,
        city, state, zip, country, tax_id, payment_terms, notes, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await query(insertQuery, [
      user.storeId,
      name,
      contact_person || null,
      email || null,
      phone || null,
      address || null,
      city || null,
      state || null,
      zip || null,
      country || 'United States',
      tax_id || null,
      payment_terms || 'Net 30',
      notes || null,
      is_active
    ]);

    const newSupplier = result.rows[0];

    return NextResponse.json({
      success: true,
      data: newSupplier
    });

  } catch (error) {
    console.error('Error in suppliers POST API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}