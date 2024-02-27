CREATE INDEX idx_sources_id ON sources (id);

CREATE INDEX idx_sources_items_id ON sources_items (id);
CREATE INDEX idx_sources_items_sourceId ON sources_items (sourceId);

CREATE INDEX idx_sources_labels_sourceId ON sources_labels (sourceId);
CREATE INDEX idx_sources_labels_name ON sources_labels (name);

CREATE INDEX idx_lists_items_itemId ON lists_items (itemId);
