import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { SourcesDataGet, SourcesDataInvalidateUserCache } from "./SourcesData";
import { SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

export async function SourceItemsDataGetForUser(context: Span, itemId: string, userId: string): Promise<SourceItem> {
  const span = StandardTracerStartSpan("SourceItemsDataGetForUser", context);
  const itemRaw = await SqlDbUtilsQuerySQL(
    span,
    "SELECT sources_items.*, sources.name as sourceName " +
      "FROM sources_items, sources " +
      "WHERE sources_items.id = ? " +
      "  AND sources.userId = ? " +
      "  AND sources.id = sources_items.sourceId ",
    [itemId, userId]
  );
  let sourceItem: SourceItem = null;
  if (itemRaw.length > 0) {
    sourceItem = SourceItem.fromRaw(itemRaw[0]);
  }
  span.end();
  return sourceItem;
}

export async function SourceItemsDataAdd(context: Span, sourceItem: SourceItem): Promise<void> {
  const span = StandardTracerStartSpan("SourceItemsDataAdd", context);
  await SqlDbUtilsQuerySQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      sourceItem.id,
      sourceItem.sourceId,
      sourceItem.title,
      sourceItem.content,
      sourceItem.url,
      sourceItem.status,
      sourceItem.datePublished.toISOString(),
      JSON.stringify(sourceItem.info),
    ]
  );
  const source = await SourcesDataGet(span, sourceItem.sourceId);
  SourcesDataInvalidateUserCache(span, await source.userId);
  span.end();
}

export async function SourceItemsDataUpdate(context: Span, sourceItem: SourceItem): Promise<void> {
  const span = StandardTracerStartSpan("SourceItemsDataUpdate", context);
  await SqlDbUtilsQuerySQL(
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
    ]
  );
  const source = await SourcesDataGet(span, sourceItem.sourceId);
  SourcesDataInvalidateUserCache(span, source.userId);
  span.end();
}

export async function SourceItemsDataDelete(context: Span, userId: string, sourceItemId: string): Promise<void> {
  const span = StandardTracerStartSpan("SourceItemsDataDelete", context);
  await SqlDbUtilsQuerySQL(span, "DELETE FROM sources_items WHERE id = ?", [sourceItemId]);
  SourcesDataInvalidateUserCache(span, userId);
  span.end();
}

export async function SourceItemsDataUpdateMultipleStatusForUser(
  context: Span,
  itemIds: string[],
  status: SourceItemStatus,
  userId: string
): Promise<void> {
  const span = StandardTracerStartSpan("SourceItemsDataUpdateMultipleStatusForUser", context);
  let inItemsId = "";
  for (const itemId of itemIds) {
    if (inItemsId.length > 0) {
      inItemsId += ",";
    }
    inItemsId += `"${itemId}"`;
  }
  await SqlDbUtilsQuerySQL(
    span,
    "UPDATE sources_items " +
      " SET status = ? " +
      " WHERE id IN ( " +
      "   SELECT sources_items.id " +
      "   FROM sources_items, sources " +
      `   WHERE sources_items.id IN (${inItemsId}) ` +
      "         AND sources_items.sourceId = sources.id " +
      "         AND sources.userId = ? " +
      " )",
    [status, userId]
  );
  SourcesDataInvalidateUserCache(span, userId);
  span.end();
}

export async function SourceItemsDataGetLastForSource(context: Span, sourceId: string): Promise<SourceItem> {
  const span = StandardTracerStartSpan("SourceItemsDataGetLastForSource", context);
  let sourceItem: SourceItem = null;
  const sourceItemRaw = await SqlDbUtilsQuerySQL(
    span,
    "SELECT * FROM sources_items WHERE sourceId = ? ORDER BY datePublished DESC LIMIT 1",
    [sourceId]
  );
  if (sourceItemRaw.length > 0) {
    sourceItem = SourceItem.fromRaw(sourceItemRaw[0]);
  }
  span.end();
  return sourceItem;
}

export async function SourceItemsDataCleanupOrphans(context: Span): Promise<void> {
  const span = StandardTracerStartSpan("SourceItemsDataCleanupOrphans", context);
  await SqlDbUtilsQuerySQL(span, "DELETE FROM sources_items WHERE sourceId NOT IN (SELECT id FROM sources)");
  span.end();
}
