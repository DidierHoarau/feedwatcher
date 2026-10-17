CREATE TABLE IF NOT EXISTS podcast_playback (
    id VARCHAR(50) NOT NULL,
    itemId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    positionSeconds INTEGER NOT NULL DEFAULT 0,
    durationSeconds INTEGER NOT NULL DEFAULT 0,
    dateUpdated VARCHAR(100) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_playback_item_user ON podcast_playback (itemId, userId);

CREATE INDEX IF NOT EXISTS idx_podcast_playback_userId ON podcast_playback (userId);
