-- Create sync_logs table for tracking background sync results
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_operations INTEGER NOT NULL DEFAULT 0,
    successful_operations INTEGER NOT NULL DEFAULT 0,
    failed_operations INTEGER NOT NULL DEFAULT 0,
    total_duration INTEGER NOT NULL DEFAULT 0, -- Duration in milliseconds
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON public.sync_logs(timestamp DESC);

-- Create index for JSON queries on results
CREATE INDEX IF NOT EXISTS idx_sync_logs_results ON public.sync_logs USING GIN(results);

-- Add cleanup function to automatically remove old sync logs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs() RETURNS void AS $$
BEGIN
    DELETE FROM public.sync_logs 
    WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE public.sync_logs IS 'Stores results from background sync operations';
COMMENT ON COLUMN public.sync_logs.total_duration IS 'Total sync duration in milliseconds';
COMMENT ON COLUMN public.sync_logs.results IS 'Detailed results for each sync operation as JSON';