import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { SourceItem } from "../model/SourceItem";
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

  public static async listForUser(context: Span, userId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SourceItemsData_getForUser", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name as sourceName " +
        "FROM sources_items, sources " +
        "WHERE sources.userId = ? " +
        "  AND sources_items.status = 'unread' " +
        "  AND sources.id = sources_items.sourceId  ",
      [userId]
    );
    for (const sourceItem of sourceItemsRaw) {
      sourceItems.push(SourceItem.fromRaw(sourceItem));
    }
    span.end();
    return sourceItems;
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
        " WHERE ID = ?",
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

  public static async listForSource(context: Span, sourceId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SourceItemsData_getLastForSource", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name as sourceName " +
        "FROM sources_items, sources " +
        "WHERE sources_items.sourceId = ? " +
        "  AND sources.id = ? " +
        "  AND status = 'unread' " +
        "  AND sources.id = sources_items.sourceId " +
        "ORDER BY datePublished DESC",
      [sourceId, sourceId]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(SourceItem.fromRaw(sourceItem));
    }
    span.end();
    return sourceItems;
  }
}
