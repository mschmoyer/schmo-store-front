#!/usr/bin/env node

/**
 * Background Sync Script for Heroku Scheduler
 * 
 * This script can be run by Heroku Scheduler to trigger automatic syncs.
 * 
 * Usage:
 *   node scripts/background-sync.js
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_BASE_URL: Base URL of the application
 *   - SYNC_AUTH_TOKEN: Authentication token for sync operations
 */

const https = require('https');
const http = require('http');

// Configuration
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const authToken = process.env.SYNC_AUTH_TOKEN;
const timeout = 10 * 60 * 1000; // 10 minutes timeout

console.log('🚀 Starting Heroku Scheduler background sync job...');
console.log(`📍 Target URL: ${baseUrl}/api/admin/sync/background`);

if (!authToken) {
  console.error('❌ SYNC_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// Parse URL
const url = new URL(`${baseUrl}/api/admin/sync/background`);
const isHttps = url.protocol === 'https:';
const requestModule = isHttps ? https : http;

// Request options
const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Heroku-Scheduler': 'true',
    'User-Agent': 'Heroku-Scheduler/1.0'
  },
  timeout: timeout
};

// Make request
const startTime = Date.now();
const req = requestModule.request(options, (res) => {
  const duration = Date.now() - startTime;
  
  console.log(`📡 Response Status: ${res.statusCode}`);
  console.log(`⏱️  Request Duration: ${duration}ms`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.success) {
        console.log('✅ Background sync completed successfully');
        
        if (response.summary) {
          console.log('📊 Sync Summary:');
          console.log(`   Total Operations: ${response.summary.totalOperations}`);
          console.log(`   Successful: ${response.summary.successfulOperations}`);
          console.log(`   Failed: ${response.summary.failedOperations}`);
          console.log(`   Duration: ${response.summary.totalDuration}ms`);
          
          if (response.summary.operations) {
            console.log('🔧 Operation Details:');
            response.summary.operations.forEach(op => {
              const status = op.success ? '✅' : '❌';
              const records = op.recordsProcessed ? ` (${op.recordsProcessed} records)` : '';
              const error = op.error ? ` - ${op.error}` : '';
              console.log(`   ${status} ${op.operation}: ${op.duration}ms${records}${error}`);
            });
          }
        }
        
        process.exit(0);
      } else {
        console.error('❌ Background sync failed:', response.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', error);
      console.error('Raw response:', data);
      process.exit(1);
    }
  });
});

// Handle request errors
req.on('error', (error) => {
  const duration = Date.now() - startTime;
  console.error(`❌ Request failed after ${duration}ms:`, error.message);
  
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
    console.error('🌐 Network connectivity issue. Check your app URL and network.');
  } else if (error.code === 'ETIMEDOUT') {
    console.error('⏰ Request timed out. The sync operation may still be running.');
  }
  
  process.exit(1);
});

// Handle timeout
req.on('timeout', () => {
  const duration = Date.now() - startTime;
  console.error(`⏰ Request timed out after ${duration}ms`);
  req.destroy();
  process.exit(1);
});

// Send the request
req.end();

console.log('⏳ Waiting for response...');