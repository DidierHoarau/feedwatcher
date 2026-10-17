CREATE TABLE IF NOT EXISTS push_subscriptions (
    id VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(300) NOT NULL,
    auth VARCHAR(300) NOT NULL,
    dateCreated VARCHAR(100) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_userId ON push_subscriptions (userId);

CREATE TABLE IF NOT EXISTS notification_state (
    userId VARCHAR(50) NOT NULL PRIMARY KEY,
    lastNewItemsAt VARCHAR(100) NOT NULL
);

ALTER TABLE users ADD COLUMN settings TEXT;
