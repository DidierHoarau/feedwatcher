import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Source } from "../model/Source";
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
        sourceItem.contemt,
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
    const sourcesItemRaw = await SqlDbutils.querySQL(
      span,
      "SELECT * FROM sources_items " + `WHERE sourceId = '${sourceId}'` + "ORDER BY datePublished DESC LIMIT 1"
    );
    if (sourcesItemRaw.length > 0) {
      sourceItem = SourceItemsData.fromRaw(sourcesItemRaw[0]);
    }
    span.end();
    return sourceItem;
  }

  //
  public static async listForSource(context: Span, sourceId: string): Promise<Source[]> {
    // const span = StandardTracer.startSpan("SourceItemsData_list", context);
    // const sourcesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM sources WHERE userId = '${userId}'`);
    const sources = [];
    // for (const sourceRaw of sourcesRaw) {
    //   sources.push(SourceItemsData.fromRaw(sourceRaw));
    // }
    // span.end();
    return sources;
  }

  private static fromRaw(sourceItemRaw: any): SourceItem {
    const sourceItem = new SourceItem();
    sourceItem.id = sourceItemRaw.id;
    sourceItem.sourceId = sourceItemRaw.sourceId;
    sourceItem.title = sourceItemRaw.title;
    sourceItem.contemt = sourceItemRaw.contemt;
    sourceItem.url = sourceItemRaw.url;
    sourceItem.status = sourceItemRaw.status;
    sourceItem.datePublished = new Date(sourceItemRaw.datePublished);
    sourceItem.contemt = JSON.parse(sourceItemRaw.info);
    return sourceItem;
  }
}
