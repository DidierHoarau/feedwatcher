CREATE TABLE IF NOT EXISTS sources_labels (
    id VARCHAR(50) NOT NULL,
    sourceId VARCHAR(50) NOT NULL,
    name VARCHAR(200),
    info TEXT NOT NULL
);
