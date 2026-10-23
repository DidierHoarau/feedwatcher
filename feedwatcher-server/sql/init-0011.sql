CREATE TABLE IF NOT EXISTS sources_fetch_state (
    sourceId VARCHAR(50) NOT NULL PRIMARY KEY,
    url TEXT NOT NULL,
    etag TEXT,
    lastModified TEXT,
    dateUpdated VARCHAR(100) NOT NULL
);
