import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }

    const result = await query(
      `SELECT 
        id, name, contact_person, email, phone, address,
        city, state, zip, country, tax_id, payment_terms, notes,
        is_active, performance_rating, total_orders, on_time_delivery_rate,
        created_at, updated_at
      FROM suppliers 
      WHERE id = $1 AND store_id = $2`,
      [params.id, user.storeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error in supplier GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      is_active
    } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json({ 
        error: 'Supplier name is required' 
      }, { status: 400 });
    }

    // Check if supplier exists and belongs to user's store
    const existingSupplier = await query(
      'SELECT id, name FROM suppliers WHERE id = $1 AND store_id = $2',
      [params.id, user.storeId]
    );

    if (existingSupplier.rows.length === 0) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Check for duplicate name (excluding current supplier)
    const duplicateCheck = await query(
      'SELECT id FROM suppliers WHERE store_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
      [user.storeId, name, params.id]
    );

    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        error: 'A supplier with this name already exists'
      }, { status: 409 });
    }

    // Update supplier
    const updateQuery = `
      UPDATE suppliers SET
        name = $3,
        contact_person = $4,
        email = $5,
        phone = $6,
        address = $7,
        city = $8,
        state = $9,
        zip = $10,
        country = $11,
        tax_id = $12,
        payment_terms = $13,
        notes = $14,
        is_active = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2
      RETURNING *
    `;

    const result = await query(updateQuery, [
      params.id,
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
      is_active !== undefined ? is_active : true
    ]);

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error in supplier PUT API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }

    // Check if supplier exists and belongs to user's store
    const existingSupplier = await query(
      'SELECT id, name FROM suppliers WHERE id = $1 AND store_id = $2',
      [params.id, user.storeId]
    );

    if (existingSupplier.rows.length === 0) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Check if supplier has any purchase orders
    const poCheck = await query(
      'SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = $1',
      [params.id]
    );

    if (parseInt(poCheck.rows[0].count) > 0) {
      // Don't delete, just deactivate
      await query(
        'UPDATE suppliers SET is_active = false WHERE id = $1 AND store_id = $2',
        [params.id, user.storeId]
      );

      return NextResponse.json({
        success: true,
        message: 'Supplier deactivated (has associated purchase orders)',
        data: { deactivated: true }
      });
    } else {
      // Safe to delete
      await query(
        'DELETE FROM suppliers WHERE id = $1 AND store_id = $2',
        [params.id, user.storeId]
      );

      return NextResponse.json({
        success: true,
        message: 'Supplier deleted successfully',
        data: { deleted: true }
      });
    }

  } catch (error) {
    console.error('Error in supplier DELETE API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}