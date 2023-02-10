import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { SourceItem } from "../model/SourceItem";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SearchItemsData {
  //
  public static async listForUser(context: Span, userId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SearchItemsData_getForUser", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
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

  public static async listForSource(context: Span, sourceId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SearchItemsData_getLastForSource", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items " +
        "WHERE sources_items.sourceId = ? " +
        "  AND status = 'unread' " +
        "ORDER BY datePublished DESC",
      [sourceId]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(SourceItem.fromRaw(sourceItem));
    }
    span.end();
    return sourceItems;
  }

  public static async listItemsForLabel(context: Span, label: string, userId: string): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("SourceItemsData_listItemsForLabel", context);
    const sourceItems: SourceItem[] = [];
    const sourceItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.* " +
        "FROM sources_items " +
        "WHERE sources_items.sourceId IN ( " +
        "    SELECT sources.id " +
        "    FROM sources, sources_labels " +
        "    WHERE sources.userId = ? AND sources_labels.sourceId = sources.id AND sources_labels.name = ? " +
        "  ) " +
        "  AND sources_items.status = 'unread' " +
        "ORDER BY datePublished DESC",
      [userId, label]
    );
    for (const sourceItem of sourceItemRaw) {
      sourceItems.push(SourceItem.fromRaw(sourceItem));
    }
    span.end();
    return sourceItems;
  }
}
