-- Remove duplicate bookmarks created before the unique index existed.
-- One row per (itemId, userId) is kept (smallest id).
DELETE FROM lists_items
WHERE id NOT IN (
  SELECT MIN(id) FROM lists_items GROUP BY itemId, userId
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_items_itemId_userId
  ON lists_items (itemId, userId);
