import { NextRequest, NextResponse } from 'next/server';
import { destroySession, getSessionFromRequest } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: 'No session token provided'
      }, { status: 400 });
    }
    
    const token = authHeader.substring(7);
    
    // Verify session exists
    const user = await getSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Invalid session'
      }, { status: 401 });
    }
    
    // Destroy session
    await destroySession(token);
    
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}