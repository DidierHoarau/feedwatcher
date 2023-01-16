CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    info TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources_entries (
    id VARCHAR(50) NOT NULL,
    source_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_date TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    info TEXT NOT NULL
);