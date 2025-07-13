import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { inventorySnapshotService } from '@/lib/services/inventorySnapshotService';

/**
 * POST /api/admin/inventory/snapshot
 * Manually trigger an inventory snapshot for the current store
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const body = await request.json();
    const { date } = body;

    // Use provided date or today
    const snapshotDate = date ? new Date(date) : new Date();

    // Check if snapshot already exists
    const exists = await inventorySnapshotService.snapshotExists(user.storeId, snapshotDate);
    if (exists) {
      return NextResponse.json({
        success: false,
        error: 'Snapshot already exists for this date'
      }, { status: 409 });
    }

    // Create the snapshot
    const result = await inventorySnapshotService.createDailySnapshot(user.storeId, snapshotDate);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Inventory snapshot created successfully',
        snapshotId: result.snapshotId,
        date: snapshotDate.toISOString().split('T')[0]
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to create snapshot'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Admin inventory snapshot POST error:', error);
    
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

/**
 * GET /api/admin/inventory/snapshot
 * Get snapshot history or check last snapshot date
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'latest') {
      // Get the latest snapshot
      const latest = await inventorySnapshotService.getLatestSnapshot(user.storeId);
      
      return NextResponse.json({
        success: true,
        data: {
          hasSnapshot: !!latest,
          snapshot: latest
        }
      });
    } else {
      // Get snapshot history
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      if (!startDate || !endDate) {
        return NextResponse.json({
          success: false,
          error: 'Start date and end date are required'
        }, { status: 400 });
      }

      const snapshots = await inventorySnapshotService.getSnapshotHistory(
        user.storeId,
        new Date(startDate),
        new Date(endDate)
      );

      return NextResponse.json({
        success: true,
        data: {
          snapshots,
          count: snapshots.length
        }
      });
    }

  } catch (error) {
    console.error('Admin inventory snapshot GET error:', error);
    
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