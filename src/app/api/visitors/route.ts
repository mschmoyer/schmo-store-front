import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const { storeId, pagePath } = await request.json();
    
    // Get IP address from request
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || realIp || '127.0.0.1';
    
    // Get user agent
    const userAgent = request.headers.get('user-agent') || '';
    
    // Insert visitor record (will be ignored if IP already visited today due to UNIQUE constraint)
    await db.query(`
      INSERT INTO visitors (store_id, ip_address, visited_date, user_agent, page_path)
      VALUES ($1, $2, CURRENT_DATE, $3, $4)
      ON CONFLICT (store_id, ip_address, visited_date) DO NOTHING
    `, [storeId, ip, userAgent, pagePath]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking visitor:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}