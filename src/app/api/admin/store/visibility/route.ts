import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { isPublic } = await request.json();
    
    if (typeof isPublic !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'isPublic must be a boolean value'
      }, { status: 400 });
    }
    
    // Update store visibility
    await db.query(`
      UPDATE stores 
      SET is_public = $1, updated_at = NOW()
      WHERE id = $2
    `, [isPublic, user.storeId]);
    
    return NextResponse.json({
      success: true,
      data: {
        isPublic,
        message: `Store is now ${isPublic ? 'public' : 'private'}`
      }
    });
    
  } catch (error) {
    console.error('Store visibility update error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}