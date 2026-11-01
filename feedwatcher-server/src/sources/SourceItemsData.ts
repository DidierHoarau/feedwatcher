import { Span } from "@opentelemetry/sdk-trace";
import { createHash } from "crypto";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { OTelTracer } from "../OTelContext";
import {
  convertToPostgresPlaceholders,
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsGetType,
  DbUtilsQuerySQL,
  PostgresDbUtilsGetPool,
} from "@devopsplaybook.io/common-utils";
import { SourcesDataGet, SourcesDataInvalidateUserCache } from "./SourcesData";

export async function SourceItemsDataGetForUser(
  context: Span,
  itemId: string,
  userId: string,
): Promise<SourceItem> {
  const span = OTelTracer().startSpan("SourceItemsDataGetForUser", context);
  const itemRaw = await DbUtilsQuerySQL(
    span,
    "SELECT sources_items.*, sources.name as sourceName " +
      "FROM sources_items, sources " +
      "WHERE sources_items.id = ? " +
      "  AND sources.userId = ? " +
      "  AND sources.id = sources_items.sourceId ",
    [itemId, userId],
  );
  let sourceItem: SourceItem = null;
  if (itemRaw.length > 0) {
    sourceItem = SourceItem.fromRaw(itemRaw[0]);
  }
  span.end();
  return sourceItem;
}

const INSERT_ITEM_SQL =
  "INSERT INTO sources_items " +
  "(id, sourceId, title, content, url, status, datePublished, thumbnail, info, dedupeKey) " +
  "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? " +
  "WHERE NOT EXISTS ( " +
  "  SELECT 1 FROM sources_items WHERE sourceId = ? AND dedupeKey = ? " +
  ")";

export const DEDUPE_KEY_MAX_LENGTH = 500;

// Returns null for missing or unparseable dates so callers can skip the item
// instead of failing the whole batch (or storing an epoch date).
export function SourceItemDateNormalize(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function dedupeKeyFor(kind: string, value: string): string {
  const key = `${kind}:${value}`;
  if (key.length <= DEDUPE_KEY_MAX_LENGTH) {
    return key;
  }
  return `${kind}:sha256:${createHash("sha256").update(value).digest("hex")}`;
}

// Item identity used for dedupe: a stable per-item id when the processor
// provides info.itemId, otherwise the item url. Items with neither are never
// deduplicated (same as before).
export function SourceItemDedupeKey(sourceItem: SourceItem): string | null {
  const itemId = sourceItem.info ? sourceItem.info.itemId : undefined;
  if (itemId !== undefined && itemId !== null && String(itemId) !== "") {
    return dedupeKeyFor("item", String(itemId));
  }
  if (sourceItem.url) {
    return dedupeKeyFor("url", sourceItem.url);
  }
  return null;
}

function itemInsertParams(sourceId: string, sourceItem: SourceItem): any[] {
  const dedupeKey = SourceItemDedupeKey(sourceItem);
  return [
    sourceItem.id,
    sourceId,
    sourceItem.title ?? "",
    sourceItem.content ?? "",
    sourceItem.url ?? "",
    sourceItem.status ?? SourceItemStatus.unread,
    SourceItemDateNormalize(sourceItem.datePublished).toISOString(),
    sourceItem.thumbnail ?? null,
    JSON.stringify(sourceItem.info ?? {}),
    dedupeKey,
    sourceId,
    dedupeKey,
  ];
}

// Inserts one source's new items in a single batch/transaction, then
// invalidates the owner's cache once. Items are deduplicated on their stable
// per-item key (info.itemId, else url); items with neither are always stored.
// An item with an invalid datePublished is skipped instead of rolling the
// whole batch back. Returns how many rows were inserted and skipped.
export async function SourceItemsDataAddMany(
  context: Span,
  sourceId: string,
  userId: string,
  sourceItems: SourceItem[],
): Promise<{ inserted: number; skipped: number }> {
  if (!sourceItems || sourceItems.length === 0) {
    return { inserted: 0, skipped: 0 };
  }
  let inserted = 0;
  let skipped = 0;
  const itemsToInsert: SourceItem[] = [];
  for (const sourceItem of sourceItems) {
    if (!SourceItemDateNormalize(sourceItem.datePublished)) {
      skipped++;
      continue;
    }
    itemsToInsert.push(sourceItem);
  }
  if (itemsToInsert.length === 0) {
    return { inserted, skipped };
  }
  const span = OTelTracer().startSpan("SourceItemsDataAddMany", context);
  try {
    if (DbUtilsGetType() === "postgres") {
      // Pin one pooled connection so BEGIN/COMMIT cannot land on different
      // sessions (the deprecated Start/Commit helpers do not).
      const client = await PostgresDbUtilsGetPool().connect();
      try {
        await client.query("BEGIN");
        const sql = convertToPostgresPlaceholders(INSERT_ITEM_SQL);
        for (const sourceItem of itemsToInsert) {
          // eslint-disable-next-line no-await-in-loop
          const result = await client.query(
            sql,
            itemInsertParams(sourceId, sourceItem),
          );
          inserted += result.rowCount ?? 0;
        }
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection is released below regardless.
        }
        throw err;
      } finally {
        client.release();
      }
    } else {
      // better-sqlite3 transactions are synchronous, so two concurrent cycles
      // cannot interleave BEGIN/COMMIT across await points.
      const db = DbUtilsGetDatabase();
      const insert = db.prepare(INSERT_ITEM_SQL);
      const runBatch = db.transaction((items: SourceItem[]) => {
        for (const sourceItem of items) {
          const result = insert.run(...itemInsertParams(sourceId, sourceItem));
          inserted += result.changes;
        }
      });
      runBatch(itemsToInsert);
    }
    skipped += itemsToInsert.length - inserted;
    await SourcesDataInvalidateUserCache(span, userId);
  } finally {
    span.end();
  }
  return { inserted, skipped };
}

export async function SourceItemsDataUpdate(
  context: Span,
  sourceItem: SourceItem,
): Promise<void> {
  const span = OTelTracer().startSpan("SourceItemsDataUpdate", context);
  await DbUtilsExecSQL(
    span,
    "UPDATE sources_items " +
      " SET title = ?, content = ?, url = ?, status = ?, datePublished = ?, info = ? " +
      " WHERE id = ?",
    [
      sourceItem.title,
      sourceItem.content,
      sourceItem.url,
      sourceItem.status,
      sourceItem.datePublished.toISOString(),
      JSON.stringify(sourceItem.info),
      sourceItem.id,
    ],
  );
  const source = await SourcesDataGet(span, sourceItem.sourceId);
  await SourcesDataInvalidateUserCache(span, source.userId);
  span.end();
}

export async function SourceItemsDataDelete(
  context: Span,
  userId: string,
  sourceItemId: string,
): Promise<void> {
  const span = OTelTracer().startSpan("SourceItemsDataDelete", context);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_items_tags WHERE itemId = ?",
    [sourceItemId],
  );
  await DbUtilsExecSQL(span, "DELETE FROM sources_items WHERE id = ?", [
    sourceItemId,
  ]);
  await SourcesDataInvalidateUserCache(span, userId);
  span.end();
}

export async function SourceItemsDataUpdateMultipleStatusForUser(
  context: Span,
  itemIds: string[],
  status: SourceItemStatus,
  userId: string,
): Promise<void> {
  const span = OTelTracer().startSpan(
    "SourceItemsDataUpdateMultipleStatusForUser",
    context,
  );
  const placeholders = itemIds.map(() => "?").join(",");
  await DbUtilsExecSQL(
    span,
    "UPDATE sources_items " +
      " SET status = ? " +
      " WHERE id IN ( " +
      "   SELECT sources_items.id " +
      "   FROM sources_items, sources " +
      `   WHERE sources_items.id IN (${placeholders}) ` +
      "         AND sources_items.sourceId = sources.id " +
      "         AND sources.userId = ? " +
      " )",
    [status, ...itemIds, userId],
  );
  await SourcesDataInvalidateUserCache(span, userId);
  span.end();
}

export async function SourceItemsDataGetLastForSource(
  context: Span,
  sourceId: string,
): Promise<SourceItem> {
  const span = OTelTracer().startSpan(
    "SourceItemsDataGetLastForSource",
    context,
  );
  let sourceItem: SourceItem = null;
  const sourceItemRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM sources_items WHERE sourceId = ? ORDER BY datePublished DESC LIMIT 1",
    [sourceId],
  );
  if (sourceItemRaw.length > 0) {
    sourceItem = SourceItem.fromRaw(sourceItemRaw[0]);
  }
  span.end();
  return sourceItem;
}

export async function SourceItemsDataCleanupOrphans(
  context: Span,
): Promise<void> {
  const span = OTelTracer().startSpan("SourceItemsDataCleanupOrphans", context);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_items_tags WHERE itemId NOT IN (SELECT id FROM sources_items)",
  );
  await DbUtilsExecSQL(
    span,
    "DELETE FROM podcast_playback WHERE itemId NOT IN (SELECT id FROM sources_items)",
  );
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_items WHERE sourceId NOT IN (SELECT id FROM sources)",
  );
  await DbUtilsExecSQL(
    span,
    "DELETE FROM lists_items WHERE itemId NOT IN (SELECT id FROM sources_items)",
  );
  span.end();
}

export async function SourceItemsDataGetCount(
  context: Span,
  status: SourceItemStatus,
): Promise<number> {
  const span = OTelTracer().startSpan("SourceItemsDataGetCount", context);
  const countRaw = await DbUtilsQuerySQL(
    span,
    "SELECT COUNT(*) as count FROM sources_items WHERE status = ?",
    [status],
  );
  let count = 0;
  if (countRaw.length > 0) {
    count = countRaw[0].count;
  }
  span.end();
  return count;
}
