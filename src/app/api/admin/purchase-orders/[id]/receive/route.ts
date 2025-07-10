import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/session';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateUser(request);
    if (!user.success) {
      return NextResponse.json({ error: user.error }, { status: 401 });
    }

    const body = await request.json();
    const { items } = body;

    // Mock implementation - in production this would update the database
    console.log('Receiving items for PO:', params.id, items);

    return NextResponse.json({
      success: true,
      data: {
        received_items: items?.length || 0,
        receiving_records: items || []
      }
    });

  } catch (error) {
    console.error('Error in receiving API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}