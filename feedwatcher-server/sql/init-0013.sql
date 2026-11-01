ALTER TABLE sources_items ADD COLUMN dedupeKey VARCHAR(512);

-- Backfill legacy rows with the URL identity used by feed processors.
-- One row per (sourceId, url) keeps the unique index build safe if old
-- duplicates exist; URLs too long for the index are left NULL and are
-- therefore not deduplicated until a keyed row exists.
UPDATE sources_items
SET dedupeKey = 'url:' || url
WHERE url <> ''
  AND LENGTH('url:' || url) <= 500
  AND id IN (
    SELECT MIN(id)
    FROM sources_items
    WHERE url <> '' AND LENGTH('url:' || url) <= 500
    GROUP BY sourceId, url
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_items_sourceId_dedupeKey
  ON sources_items (sourceId, dedupeKey);
