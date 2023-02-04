CREATE TABLE IF NOT EXISTS sources_items_saved (
    id VARCHAR(50) NOT NULL,
    itemId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    listName VARCHAR(200),
    info TEXT NOT NULL
);
