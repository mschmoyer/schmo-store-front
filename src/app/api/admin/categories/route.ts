import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

/**
 * GET /api/admin/categories
 * Get categories for the authenticated user's store
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    // For now, return an empty array since categories aren't fully implemented
    // In a real app, this would fetch from the database
    const categories: Array<{ id: string; name: string }> = [];

    return NextResponse.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Admin categories GET error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}