import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { store_id, search_query, results_count, timestamp } = body;
    
    if (!store_id || !search_query || typeof results_count !== 'number') {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: store_id, search_query, results_count'
      }, { status: 400 });
    }

    // Insert search tracking record
    const insertResult = await db.query(`
      INSERT INTO search_tracking (
        store_id, search_query, results_count, created_at
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      store_id,
      search_query.trim(),
      results_count,
      timestamp ? new Date(timestamp) : new Date()
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id: insertResult.rows[0].id,
        message: 'Search tracked successfully'
      }
    });

  } catch (error) {
    console.error('Search tracking error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}