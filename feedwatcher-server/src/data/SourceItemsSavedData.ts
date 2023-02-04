import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";
import { v4 as uuidv4 } from "uuid";
import { SourceItem } from "../model/SourceItem";

export class SourceItemsSavedData {
  //
  public static async listItemsForUser(context: Span, listName: string, userId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SourceItemsData_listItemsForLabel", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items, sources_items_saved " +
        "WHERE sources_items.id = sources_items_saved.itemId  " +
        "  AND sources_items_saved.userId = ? " +
        "  AND sources_items_saved.listName = ? " +
        "ORDER BY datePublished DESC",
      [userId, listName]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(SourceItemsSavedData.fromRawItems(sourceItem));
    }
    span.end();
    return sourceItems;
  }

  public static async getItemForUser(context: Span, itemId: string, userId: string): Promise<SourceItem> {
    const span = StandardTracer.startSpan("SourceItemsData_listItemsForLabel", context);
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items, sources_items_saved " +
        "WHERE sources_items.id = ? " +
        "  AND sources_items_saved.itemId = ? " +
        "  AND sources_items_saved.userId = ? " +
        "ORDER BY datePublished DESC",
      [itemId, itemId, userId]
    );
    let sourceItem: SourceItem = null;
    if (sourceItemRaw.length > 0) {
      sourceItem = SourceItemsSavedData.fromRawItems(sourceItemRaw[0]);
    }
    span.end();
    return sourceItem;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(sourceRaw: any): Source {
    const source = new Source();
    source.id = sourceRaw.id;
    source.userId = sourceRaw.userId;
    source.name = sourceRaw.name;
    source.info = JSON.parse(sourceRaw.info);
    return source;
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
