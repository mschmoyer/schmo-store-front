import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request);
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or expired session'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.userId,
          storeId: user.storeId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          store: {
            id: user.storeId,
            name: user.storeName,
            slug: user.storeSlug
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Session verification error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}