-- Speeds up the per-user status counts used by the scheduler gauges.
CREATE INDEX IF NOT EXISTS idx_sources_items_sourceId_status
  ON sources_items (sourceId, status);
