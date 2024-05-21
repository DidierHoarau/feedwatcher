import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItem } from "../model/SourceItem";
import { ListItem } from "../model/ListItem";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { SourcesDataInvalidateUserCache } from "./SourcesData";
import { SqlDbUtilsExecSQL, SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

export class ListsItemsData {
  //
  public static async add(context: Span, listItem: ListItem): Promise<void> {
    const span = StandardTracerStartSpan("ListsItemsData_add", context);
    await SqlDbUtilsExecSQL(span, "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)", [
      listItem.id,
      listItem.itemId,
      listItem.userId,
      listItem.name,
      JSON.stringify(listItem.info),
    ]);
    SourcesDataInvalidateUserCache(span, listItem.userId);
    span.end();
  }

  public static async deleteForUser(context: Span, itemId: string, userId: string): Promise<void> {
    const span = StandardTracerStartSpan("ListsItemsData_deleteForUser", context);
    await SqlDbUtilsExecSQL(span, "DELETE FROM lists_items WHERE itemId = ? AND userId = ?", [itemId, userId]);
    SourcesDataInvalidateUserCache(span, userId);
    span.end();
  }

  public static async getItemForUser(context: Span, itemId: string, userId: string): Promise<SourceItem> {
    const span = StandardTracerStartSpan("ListsItemsData_getItemForUser", context);
    const sourceItemRaw = await SqlDbUtilsQuerySQL(
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
