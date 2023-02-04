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
      "SELECT sources_items.* " +
        " FROM sources_items, sources" +
        " WHERE sources_items.id = ? AND sources.userId = ? AND sources.id = sources_items.sourceId ",
      [itemId, userId]
    );
    let sourceItem: SourceItem = null;
    if (itemRaw.length > 0) {
      sourceItem = SourceItemsData.fromRaw(itemRaw[0]);
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
      sourceItem = SourceItemsData.fromRaw(sourceItemRaw[0]);
    }
    span.end();
    return sourceItem;
  }

  public static async listForSource(context: Span, sourceId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SourceItemsData_getLastForSource", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT * FROM sources_items WHERE sourceId = ? AND status = 'unread' ORDER BY datePublished DESC",
      [sourceId]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(SourceItemsData.fromRaw(sourceItem));
    }
    span.end();
    return sourceItems;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(sourceItemRaw: any): SourceItem {
    const sourceItem = new SourceItem();
    sourceItem.id = sourceItemRaw.id;
    sourceItem.sourceId = sourceItemRaw.sourceId;
    sourceItem.title = sourceItemRaw.title;
    sourceItem.content = sourceItemRaw.content;
    sourceItem.url = sourceItemRaw.url;
    sourceItem.status = sourceItemRaw.status;
    sourceItem.datePublished = new Date(sourceItemRaw.datePublished);
    sourceItem.info = JSON.parse(sourceItemRaw.info);
    return sourceItem;
  }
}
