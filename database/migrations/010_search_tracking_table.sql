-- Migration: 010_search_tracking_table
-- Description: Add search tracking functionality to monitor user searches
-- Date: 2025-07-09

-- Create search_tracking table
CREATE TABLE IF NOT EXISTS search_tracking (
    id SERIAL PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    search_query TEXT NOT NULL,
    results_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_search_tracking_store_id ON search_tracking(store_id);
CREATE INDEX IF NOT EXISTS idx_search_tracking_created_at ON search_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_search_tracking_query ON search_tracking(search_query);
CREATE INDEX IF NOT EXISTS idx_search_tracking_store_query ON search_tracking(store_id, search_query);

-- Add a comment to the table
COMMENT ON TABLE search_tracking IS 'Tracks user search queries on store pages for analytics';
COMMENT ON COLUMN search_tracking.store_id IS 'Reference to the store where the search was performed';
COMMENT ON COLUMN search_tracking.search_query IS 'The search term entered by the user';
COMMENT ON COLUMN search_tracking.results_count IS 'Number of products returned for the search query';
COMMENT ON COLUMN search_tracking.created_at IS 'Timestamp when the search was performed';