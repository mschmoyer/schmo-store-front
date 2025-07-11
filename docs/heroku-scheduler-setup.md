# Heroku Scheduler Setup for Background Sync

This guide explains how to set up automatic background synchronization for ShipStation integration using Heroku Scheduler.

## Overview

The background sync system automatically synchronizes data between your application and ShipStation at regular intervals. It includes:

- **Parallel Processing**: Operations that can run simultaneously do so for faster execution
- **Error Handling**: Individual operation failures don't stop the entire sync
- **Logging**: Detailed logs are stored in the database for monitoring
- **Retry Logic**: Built-in retry mechanisms for failed operations

## Prerequisites

1. Heroku app deployed and running
2. ShipStation integration configured in your application
3. Database migrations applied (including the sync_logs table)

## Setup Instructions

### 1. Environment Variables

Add the following environment variables to your Heroku app:

```bash
# Authentication token for sync operations
heroku config:set SYNC_AUTH_TOKEN=your-secure-random-token

# Base URL of your application (usually set automatically by Heroku)
heroku config:set NEXT_PUBLIC_BASE_URL=https://your-app-name.herokuapp.com
```

To generate a secure token:
```bash
# Generate a random token
openssl rand -hex 32
```

### 2. Apply Database Migration

Make sure the sync_logs table exists by running the migration:

```sql
-- This should be in your migration: 015_sync_logs_table.sql
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_operations INTEGER NOT NULL DEFAULT 0,
    successful_operations INTEGER NOT NULL DEFAULT 0,
    failed_operations INTEGER NOT NULL DEFAULT 0,
    total_duration INTEGER NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3. Install Heroku Scheduler Add-on

```bash
# Add the Heroku Scheduler add-on to your app
heroku addons:create scheduler:standard

# Open the scheduler dashboard
heroku addons:open scheduler
```

### 4. Configure Scheduled Jobs

In the Heroku Scheduler dashboard, create a new job with:

#### For Regular Sync (Every 30 minutes)
- **Schedule**: Every 30 minutes
- **Command**: `npm run sync:background`
- **Dyno Type**: Standard-1X (recommended)

#### For Hourly Sync (Every hour)
- **Schedule**: Every hour at :00
- **Command**: `npm run sync:background`
- **Dyno Type**: Standard-1X

#### For Daily Sync (Once per day)
- **Schedule**: Daily at 2:00 AM UTC
- **Command**: `npm run sync:background`
- **Dyno Type**: Standard-1X

### 5. Test the Setup

You can test the background sync manually:

```bash
# Test via npm script
heroku run npm run sync:test

# Test via direct API call
curl -X POST https://your-app-name.herokuapp.com/api/admin/sync/background \
  -H "Authorization: Bearer your-sync-token" \
  -H "Content-Type: application/json"
```

## Sync Operations

The background sync performs the following operations in order:

### Phase 1: Foundation Sync (Sequential)
1. **Warehouses** - Sync warehouse/shipping locations
2. **Inventory Warehouses** - Sync warehouse mappings
3. **Inventory Locations** - Sync location mappings

### Phase 2: Content Sync (Parallel)
1. **Products** - Sync product information and categories
2. **Inventory** - Sync stock levels and quantities

## Monitoring

### View Sync Logs

Check sync history via API:
```bash
curl -H "Authorization: Bearer your-sync-token" \
  https://your-app-name.herokuapp.com/api/admin/sync/background
```

### Check Heroku Logs

```bash
# View recent logs
heroku logs --tail --app your-app-name

# View logs from a specific time
heroku logs --since="1 hour ago" --app your-app-name

# View logs from the scheduler
heroku logs --ps scheduler --app your-app-name
```

### Database Monitoring

Query sync results directly:
```sql
-- View recent sync results
SELECT 
    timestamp,
    total_operations,
    successful_operations,
    failed_operations,
    total_duration,
    results
FROM sync_logs 
ORDER BY timestamp DESC 
LIMIT 10;

-- View failed operations
SELECT 
    timestamp,
    jsonb_pretty(results) as operations
FROM sync_logs 
WHERE failed_operations > 0 
ORDER BY timestamp DESC;
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: Unauthorized. This endpoint is for background jobs only.
```

**Solution**: Check that `SYNC_AUTH_TOKEN` is set correctly:
```bash
heroku config:get SYNC_AUTH_TOKEN
```

#### 2. Timeout Errors
```
Error: Request timed out
```

**Solution**: 
- Increase dyno size to Standard-2X
- Check if ShipStation API is responding slowly
- Consider splitting sync into smaller chunks

#### 3. Database Connection Errors
```
Error: Connection to database failed
```

**Solution**:
- Check DATABASE_URL is configured
- Verify database is accessible
- Check connection pool settings

#### 4. No Active Integrations
```
Info: No active ShipStation integrations found
```

**Solution**:
- Verify ShipStation integration is configured and active
- Check integration settings in the admin panel
- Ensure integration has valid API credentials

### Performance Optimization

#### 1. Adjust Sync Frequency
- **High Volume Stores**: Every 15-30 minutes
- **Medium Volume Stores**: Every 1-2 hours  
- **Low Volume Stores**: Daily

#### 2. Monitor Resource Usage
```bash
# Check dyno usage
heroku ps --app your-app-name

# Check add-on usage
heroku addons --app your-app-name
```

#### 3. Database Maintenance
```sql
-- Clean up old sync logs (run weekly)
DELETE FROM sync_logs WHERE timestamp < NOW() - INTERVAL '30 days';

-- Analyze table for performance
ANALYZE sync_logs;
```

## Scaling Considerations

### Multiple Stores
The system automatically detects and syncs all active ShipStation integrations. No additional configuration needed.

### High-Frequency Sync
For high-frequency updates, consider:
- Using ShipStation webhooks for real-time updates
- Implementing queue-based processing
- Using dedicated worker dynos

### Error Alerting
Set up monitoring alerts:
```bash
# Install monitoring add-on
heroku addons:create papertrail

# Set up log-based alerts in Papertrail dashboard
# Alert on: "Background sync job failed"
```

## Security

- **Token Security**: Store sync tokens securely in Heroku config
- **API Access**: Sync endpoint only accepts requests with valid tokens
- **Network Security**: Use HTTPS for all communications
- **Rate Limiting**: Built-in protection against abuse

## Support

For issues with the background sync system:
1. Check Heroku logs for errors
2. Review sync_logs table for detailed results
3. Test sync manually to isolate issues
4. Monitor ShipStation API status and rate limits