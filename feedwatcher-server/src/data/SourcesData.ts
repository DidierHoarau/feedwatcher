import { Span } from "@opentelemetry/sdk-trace-base";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SourcesData {
  //
  public static async get(context: Span, sourceId: string): Promise<Source> {
    const span = StandardTracer.startSpan("SourcesData_get", context);
    const sourceRaw = await SqlDbutils.querySQL(span, "SELECT * FROM sources WHERE id = ?", [sourceId]);
    let source: Source = null;
    if (sourceRaw.length > 0) {
      source = SourcesData.fromRaw(sourceRaw[0]);
    }
    span.end();
    return source;
  }

  public static async listForUser(context: Span, userId: string): Promise<Source[]> {
    const span = StandardTracer.startSpan("SourcesData_listForUser", context);
    const sourcesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM sources WHERE userId = '${userId}'`);
    const sources = [];
    for (const sourceRaw of sourcesRaw) {
      sources.push(SourcesData.fromRaw(sourceRaw));
    }
    span.end();
    return sources;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async listCountsForUser(context: Span, userId: string): Promise<any[]> {
    const span = StandardTracer.startSpan("SourcesData_listCountsForUser", context);
    const countsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT COUNT(id) as unreadCount, sourceId FROM sources_items " +
        "WHERE sourceId IN (" +
        "    SELECT id FROM sources " +
        "    WHERE userId = ? " +
        "  ) " +
        "  AND status = ? " +
        "GROUP BY sourceId ",
      [userId, "unread"]
    );
    span.end();
    return countsRaw;
  }

  public static async listAll(context: Span): Promise<Source[]> {
    const span = StandardTracer.startSpan("SourcesData_listAll", context);
    const sourcesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM sources`);
    const sources = [];
    for (const sourceRaw of sourcesRaw) {
      sources.push(SourcesData.fromRaw(sourceRaw));
    }
    span.end();
    return sources;
  }

  public static async add(context: Span, source: Source): Promise<void> {
    const span = StandardTracer.startSpan("SourcesData_add", context);
    await SqlDbutils.querySQL(span, "INSERT INTO sources (id,userId,name,info) VALUES (?,?,?,?)", [
      source.id,
      source.userId,
      source.name,
      JSON.stringify(source.info),
    ]);
    span.end();
  }

  public static async update(context: Span, source: Source): Promise<void> {
    const span = StandardTracer.startSpan("SourcesData_update", context);
    await SqlDbutils.execSQL(span, "UPDATE sources SET name = ?, info = ? WHERE id = ?", [
      source.name,
      JSON.stringify(source.info),
      source.id,
    ]);
    span.end();
  }

  public static async delete(context: Span, sourceId: string): Promise<void> {
    const span = StandardTracer.startSpan("SourcesData_delete", context);
    await SqlDbutils.execSQL(span, "DELETE FROM sources WHERE id = ?", [sourceId]);
    await SqlDbutils.execSQL(span, "DELETE FROM sources_items WHERE sourceId = ?", [sourceId]);
    await SqlDbutils.execSQL(span, "DELETE FROM sources_labels WHERE sourceId = ?", [sourceId]);
    span.end();
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
