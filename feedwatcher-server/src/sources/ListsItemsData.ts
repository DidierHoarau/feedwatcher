import { Span } from "@opentelemetry/sdk-trace-base";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "../utils-std-ts/SqlDbUtils";
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
      sourceItem = SourceItem.fromRaw(sourceItemRaw[0]);
    }
    span.end();
    return sourceItem;
  }
}
