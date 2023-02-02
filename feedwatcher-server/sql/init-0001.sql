CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    passwordEncrypted VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    info TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources_items (
    id VARCHAR(50) NOT NULL,
    sourceId VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    datePublished VARCHAR(100) NOT NULL,
    info TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources_labels (
    id VARCHAR(50) NOT NULL,
    sourceId VARCHAR(50) NOT NULL,
    name VARCHAR(200),
    info TEXT NOT NULL
);
