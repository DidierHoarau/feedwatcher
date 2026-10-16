CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    title,
    content,
    content='sources_items',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS sources_items_fts_ai AFTER INSERT ON sources_items BEGIN
    INSERT INTO items_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS sources_items_fts_ad AFTER DELETE ON sources_items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS sources_items_fts_au AFTER UPDATE OF title, content ON sources_items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
    INSERT INTO items_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

INSERT INTO items_fts(items_fts) VALUES ('rebuild');

CREATE TABLE IF NOT EXISTS sources_items_tags (
    id VARCHAR(50) NOT NULL,
    itemId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_items_tags_itemId ON sources_items_tags (itemId);

CREATE INDEX IF NOT EXISTS idx_sources_items_tags_userId_name ON sources_items_tags (userId, name);
