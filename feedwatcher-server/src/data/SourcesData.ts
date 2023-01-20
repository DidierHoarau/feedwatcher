import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SourcesData {
  //
  public static async listForUser(context: Span, userId: string): Promise<Source[]> {
    const span = StandardTracer.startSpan("SourcesData_list", context);
    const sourcesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM sources WHERE user_id = '${userId}'`);
    const sources = [];
    for (const sourceRaw of sourcesRaw) {
      sources.push(SourcesData.fromRaw(sourceRaw));
    }
    span.end();
    return sources;
  }

  public static async listAll(context: Span): Promise<Source[]> {
    const span = StandardTracer.startSpan("SourcesData_list", context);
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
    await SqlDbutils.querySQL(
      span,
      "INSERT INTO sources (id,user_id,name,info)" +
        `VALUES ('${source.id}','${source.userId}','${source.name}','${JSON.stringify(source.info)}')`
    );
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(sourceRaw: any): Source {
    const source = new Source();
    source.id = sourceRaw.id;
    source.userId = sourceRaw.user_id;
    source.name = sourceRaw.name;
    source.info = JSON.parse(sourceRaw.info);
    return source;
  }
}
