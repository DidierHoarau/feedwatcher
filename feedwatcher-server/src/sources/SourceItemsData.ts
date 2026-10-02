import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
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

export async function SourceItemsDataAdd(
  context: Span,
  sourceItem: SourceItem,
): Promise<void> {
  const span = OTelTracer().startSpan("SourceItemsDataAdd", context);
  // URL dedupe: re-fetched items (e.g. date-less feeds reprocessed every
  // cycle) must not be inserted twice. Items without a url skip the guard.
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? " +
      "WHERE ? = '' OR NOT EXISTS ( " +
      "  SELECT 1 FROM sources_items WHERE sourceId = ? AND url = ? " +
      ")",
    [
      sourceItem.id,
      sourceItem.sourceId,
      sourceItem.title,
      sourceItem.content,
      sourceItem.url,
      sourceItem.status,
      sourceItem.datePublished.toISOString(),
      sourceItem.thumbnail,
      JSON.stringify(sourceItem.info),
      sourceItem.url,
      sourceItem.sourceId,
      sourceItem.url,
    ],
  );
  const source = await SourcesDataGet(span, sourceItem.sourceId);
  await SourcesDataInvalidateUserCache(span, await source.userId);
  span.end();
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
    "DELETE FROM sources_items WHERE sourceId NOT IN (SELECT id FROM sources)",
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
