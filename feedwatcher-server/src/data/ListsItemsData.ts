import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";
import { SourceItem } from "../model/SourceItem";
import { ListItem } from "../model/ListItem";

export class ListsItemsData {
  //
  public static async add(context: Span, listItem: ListItem): Promise<void> {
    const span = StandardTracer.startSpan("ListsItemsData_add", context);
    await SqlDbutils.execSQL(span, "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)", [
      listItem.id,
      listItem.itemId,
      listItem.userId,
      listItem.name,
      JSON.stringify(listItem.info),
    ]);
    span.end();
  }

  public static async deleteForUser(context: Span, itemId: string, userId: string): Promise<void> {
    const span = StandardTracer.startSpan("ListsItemsData_deleteForUser", context);
    await SqlDbutils.execSQL(span, "DELETE FROM lists_items WHERE itemId = ? AND userId = ?", [itemId, userId]);
    span.end();
  }

  public static async listItemsForUser(context: Span, userId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("ListsItemsData_listItemsForUser", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items, lists_items " +
        "WHERE sources_items.id = lists_items.itemId  " +
        "  AND lists_items.userId = ? " +
        "ORDER BY datePublished DESC",
      [userId]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(ListsItemsData.fromRawItems(sourceItem));
    }
    span.end();
    return sourceItems;
  }

  public static async getItemForUser(context: Span, itemId: string, userId: string): Promise<SourceItem> {
    const span = StandardTracer.startSpan("ListsItemsData_getItemForUser", context);
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items, lists_items " +
        "WHERE sources_items.id = ? " +
        "  AND lists_items.itemId = ? " +
        "  AND lists_items.userId = ? " +
        "ORDER BY datePublished DESC",
      [itemId, itemId, userId]
    );
    let sourceItem: SourceItem = null;
    if (sourceItemRaw.length > 0) {
      sourceItem = ListsItemsData.fromRawItems(sourceItemRaw[0]);
    }
    span.end();
    return sourceItem;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRawItems(sourceItemRaw: any): SourceItem {
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
