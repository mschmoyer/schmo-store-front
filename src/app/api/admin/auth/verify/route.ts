import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request);
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or expired session'
      }, { status: 401 });
    }
    
    /*
     * The admin flag is read from the database rather than the token. The session JWT is signed at
     * sign-in and lives for seven days; the flag has to be able to change inside that window, in
     * both directions. This is the merchant shell's copy — it decides whether the sidebar shows
     * the "Admin" door and nothing else. Every platform route re-checks it server-side, so a
     * client that forges `isAdmin: true` in its own memory gets a door that opens onto a 403.
     */
    const isAdmin = await isPlatformAdmin(user.userId);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.userId,
          isAdmin,
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