import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";
import { v4 as uuidv4 } from "uuid";

export class SourceLabelsData {
  //
  public static async listForUser(context: Span, userId: string): Promise<Source[]> {
    const span = StandardTracer.startSpan("SourceLabelsData_listForUser", context);
    const sourceLabelsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_labels.name as labelName, sources.name as sourceName, sources.id as sourceId, sources.info as sourceInfo " +
        "FROM sources  LEFT JOIN sources_labels ON sources_labels.sourceId = sources.id " +
        "WHERE sources.userId = ?",
      [userId]
    );
    const sourcesLabels = [];
    for (const sourceLabelRaw of sourceLabelsRaw) {
      sourceLabelRaw.sourceInfo = JSON.parse(sourceLabelRaw.sourceInfo) || {};
      sourcesLabels.push(sourceLabelRaw);
    }
    span.end();
    return sourcesLabels;
  }

  public static async setSourceLabels(context: Span, sourceId: string, labels: string[]): Promise<void> {
    const span = StandardTracer.startSpan("SourceLabelsData_setSourceLabels", context);
    await SqlDbutils.execSQL(span, "DELETE FROM sources_labels WHERE sourceId = ?", [sourceId]);
    for (const label of labels) {
      await SqlDbutils.querySQL(span, "INSERT INTO sources_labels (id,sourceId,name,info) VALUES (?,?,?,?)", [
        uuidv4(),
        sourceId,
        label.trim(),
        JSON.stringify({}),
      ]);
    }
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async getSourceLabels(context: Span, sourceId: string): Promise<any[]> {
    const span = StandardTracer.startSpan("SourceLabelsData_getSourceLabels", context);
    const labelsRaw = await SqlDbutils.querySQL(span, "SELECT * FROM sources_labels WHERE sourceId = ?", [sourceId]);
    const labels = [];
    for (const labelRaw of labelsRaw) {
      labelRaw.info = JSON.parse(labelRaw.info) || {};
      labels.push(labelRaw);
    }
    span.end();
    return labels;
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
}
