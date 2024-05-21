import { Span } from "@opentelemetry/sdk-trace-base";
import { Source } from "../model/Source";
import { v4 as uuidv4 } from "uuid";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { SourcesDataGet, SourcesDataInvalidateUserCache } from "./SourcesData";
import { SqlDbUtilsExecSQL, SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

export class SourceLabelsData {
  //
  public static async listForUser(context: Span, userId: string): Promise<Source[]> {
    const span = StandardTracerStartSpan("SourceLabelsData_listForUser", context);
    const sourceLabelsRaw = await SqlDbUtilsQuerySQL(
      span,
      "SELECT sources_labels.name as labelName, " +
        "  sources.name as sourceName, " +
        "  sources.id as sourceId, " +
        "  sources.info as sourceInfo " +
        "FROM sources " +
        "  LEFT JOIN sources_labels ON sources_labels.sourceId = sources.id " +
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
    const span = StandardTracerStartSpan("SourceLabelsData_setSourceLabels", context);
    await SqlDbUtilsExecSQL(span, "DELETE FROM sources_labels WHERE sourceId = ?", [sourceId]);
    for (const label of labels) {
      await SqlDbUtilsQuerySQL(span, "INSERT INTO sources_labels (id,sourceId,name,info) VALUES (?,?,?,?)", [
        uuidv4(),
        sourceId,
        label.trim(),
        JSON.stringify({}),
      ]);
    }
    const source = await SourcesDataGet(span, sourceId);
    SourcesDataInvalidateUserCache(span, source.userId);
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async getSourceLabels(context: Span, sourceId: string): Promise<any[]> {
    const span = StandardTracerStartSpan("SourceLabelsData_getSourceLabels", context);
    const labelsRaw = await SqlDbUtilsQuerySQL(span, "SELECT * FROM sources_labels WHERE sourceId = ?", [sourceId]);
    const labels = [];
    for (const labelRaw of labelsRaw) {
      labelRaw.info = JSON.parse(labelRaw.info) || {};
      labels.push(labelRaw);
    }
    span.end();
    return labels;
  }
}
