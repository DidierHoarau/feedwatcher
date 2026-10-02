CREATE INDEX IF NOT EXISTS idx_sources_userId ON sources (userId);

CREATE INDEX IF NOT EXISTS idx_sources_items_datePublished ON sources_items (datePublished);

CREATE INDEX IF NOT EXISTS idx_sources_items_sourceId_datePublished ON sources_items (sourceId, datePublished);

CREATE INDEX IF NOT EXISTS idx_lists_items_userId ON lists_items (userId);
