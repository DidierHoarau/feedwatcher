import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { SourceItem } from "../model/SourceItem";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SourceItemsData {
  //
  public static async add(context: Span, sourceItem: SourceItem): Promise<void> {
    const span = StandardTracer.startSpan("SourceItemsData_add", context);
    await SqlDbutils.querySQL(
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
      "SELECT * FROM sources_items WHERE sourceId = ? ORDER BY datePublished DESC",
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
