import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SourceItemsData {
  //
  public static async getForUser(context: Span, itemId: string, userId: string): Promise<SourceItem> {
    const span = StandardTracer.startSpan("SourceItemsData_getForUser", context);
    const itemRaw = await SqlDbutils.querySQL(
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

  public static async add(context: Span, sourceItem: SourceItem): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_add", context);
    await SqlDbutils.execSQL(
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
    span.end();
  }

  public static async update(context: Span, sourceItem: SourceItem): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_update", context);
    await SqlDbutils.execSQL(
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
    span.end();
  }

  public static async delete(context: Span, sourceItemId: string): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_delete", context);
    await SqlDbutils.execSQL(span, "DELETE FROM sources_items WHERE id = ?", [sourceItemId]);
    span.end();
  }

  public static async updateMultipleStatusForUser(
    context: Span,
    itemIds: string[],
    status: SourceItemStatus,
    userId: string
  ): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_updateMultipleStatusForUser", context);
    let inItemsId = "";
    for (const itemId of itemIds) {
      if (inItemsId.length > 0) {
        inItemsId += ",";
      }
      inItemsId += `"${itemId}"`;
    }
    await SqlDbutils.execSQL(
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
    span.end();
  }

  public static async getLastForSource(context: Span, sourceId: string): Promise<SourceItem> {
    const span = StandardTracer.startSpan("SourceItemsData_getLastForSource", context);
    let sourceItem: SourceItem = null;
    const sourceItemRaw = await SqlDbutils.querySQL(
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

  public static async cleanupOrphans(context: Span): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_cleanupOrphans", context);
    await SqlDbutils.execSQL(span, "DELETE FROM sources_items WHERE sourceId NOT IN (SELECT id FROM sources)");
    span.end();
  }
}
