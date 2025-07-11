/**
 * Background Sync API Endpoint
 * Used by Heroku Scheduler to run automatic syncs
 */

import { NextRequest, NextResponse } from 'next/server';
import BackgroundSyncService from '@/lib/services/backgroundSyncService';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify this is a legitimate background job request
    const authHeader = request.headers.get('authorization');
    const cronHeader = request.headers.get('x-heroku-scheduler');
    const syncToken = process.env.SYNC_AUTH_TOKEN;
    
    // Allow requests from Heroku Scheduler or with valid auth token
    const isValidCronJob = cronHeader === 'true';
    const isValidAuthToken = authHeader === `Bearer ${syncToken}` && syncToken;
    
    if (!isValidCronJob && !isValidAuthToken) {
      console.warn('🚫 Unauthorized background sync attempt');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized. This endpoint is for background jobs only.' 
        },
        { status: 401 }
      );
    }

    console.log('🚀 Background sync job started via API');
    
    // Parse request body for any options (currently unused but kept for future extensibility)
    try {
      const body = await request.text();
      if (body) {
        JSON.parse(body); // Validate JSON but don't use yet
      }
    } catch {
      // Body parsing failed, continue with defaults
    }

    // Initialize and run sync service
    const syncService = new BackgroundSyncService();
    const summary = await syncService.runFullSync();
    
    const totalDuration = Date.now() - startTime;
    
    // Log summary
    console.log('📊 Background sync summary:', {
      totalOperations: summary.totalOperations,
      successful: summary.successfulOperations,
      failed: summary.failedOperations,
      duration: `${totalDuration}ms`,
      timestamp: summary.timestamp
    });

    // Return success response with summary
    return NextResponse.json({
      success: true,
      message: 'Background sync completed',
      summary: {
        totalOperations: summary.totalOperations,
        successfulOperations: summary.successfulOperations,
        failedOperations: summary.failedOperations,
        totalDuration: summary.totalDuration,
        timestamp: summary.timestamp,
        operations: summary.results.map(r => ({
          operation: r.operation,
          success: r.success,
          duration: r.duration,
          recordsProcessed: r.recordsProcessed,
          error: r.error
        }))
      }
    });
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('❌ Background sync job failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      duration: totalDuration,
      timestamp: new Date().toISOString()
    }, { 
      status: 500 
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = request.headers.get('authorization');
    const cronHeader = request.headers.get('x-heroku-scheduler');
    const syncToken = process.env.SYNC_AUTH_TOKEN;
    
    const isValidCronJob = cronHeader === 'true';
    const isValidAuthToken = authHeader === `Bearer ${syncToken}` && syncToken;
    
    if (!isValidCronJob && !isValidAuthToken) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get sync history
    const syncService = new BackgroundSyncService();
    const history = await syncService.getSyncHistory(20);
    
    return NextResponse.json({
      success: true,
      data: {
        syncHistory: history,
        lastSync: history[0] || null,
        totalSyncs: history.length
      }
    });
    
  } catch (error) {
    console.error('Failed to get sync history:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sync history'
    }, { 
      status: 500 
    });
  }
}

// Health check endpoint for the sync service
export async function OPTIONS() {
  return NextResponse.json({
    success: true,
    message: 'Background sync service is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
}