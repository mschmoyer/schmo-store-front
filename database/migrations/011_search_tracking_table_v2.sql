-- Migration 011: Add search tracking functionality to monitor user searches  
-- Description: Creates search_tracking table for analytics and search monitoring
-- Version: 1.0.0
-- Date: 2025-07-09

BEGIN;

-- Create search_tracking table for monitoring user search behavior
CREATE TABLE IF NOT EXISTS public.search_tracking (
    id SERIAL PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    search_query TEXT NOT NULL,
    results_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying and analytics
CREATE INDEX IF NOT EXISTS idx_search_tracking_store_id ON public.search_tracking(store_id);
CREATE INDEX IF NOT EXISTS idx_search_tracking_created_at ON public.search_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_search_tracking_query ON public.search_tracking(search_query);
CREATE INDEX IF NOT EXISTS idx_search_tracking_store_query ON public.search_tracking(store_id, search_query);
CREATE INDEX IF NOT EXISTS idx_search_tracking_analytics ON public.search_tracking(store_id, created_at, results_count);

-- Add table and column comments for documentation
COMMENT ON TABLE public.search_tracking IS 'Tracks user search queries on store pages for analytics and optimization';
COMMENT ON COLUMN public.search_tracking.store_id IS 'Reference to the store where the search was performed';
COMMENT ON COLUMN public.search_tracking.search_query IS 'The search term entered by the user (trimmed and normalized)';
COMMENT ON COLUMN public.search_tracking.results_count IS 'Number of products returned for the search query';
COMMENT ON COLUMN public.search_tracking.created_at IS 'Timestamp when the search was performed';

-- Record migration in schema_migrations table
INSERT INTO public.schema_migrations (version, description) 
VALUES ('011', 'Add search tracking functionality to monitor user searches')
ON CONFLICT (version) DO NOTHING;

COMMIT;