import { Span } from "@opentelemetry/sdk-trace";
import { DbUtilsExecSQL, DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";

export interface SourceFetchState {
  url: string;
  etag: string | null;
  lastModified: string | null;
}

export async function SourcesFetchStateDataGet(
  context: Span,
  sourceId: string,
): Promise<SourceFetchState | null> {
  const span = OTelTracer().startSpan("SourcesFetchStateDataGet", context);
  const rowsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT url, etag, lastModified FROM sources_fetch_state WHERE sourceId = ?",
    [sourceId],
  );
  let state: SourceFetchState | null = null;
  if (rowsRaw.length > 0) {
    state = {
      url: rowsRaw[0].url,
      etag: rowsRaw[0].etag ?? null,
      lastModified: rowsRaw[0].lastModified ?? null,
    };
  }
  span.end();
  return state;
}

export async function SourcesFetchStateDataSave(
  context: Span,
  sourceId: string,
  state: SourceFetchState,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesFetchStateDataSave", context);
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_fetch_state (sourceId, url, etag, lastModified, dateUpdated) " +
      "VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(sourceId) DO UPDATE SET " +
      "  url = excluded.url, " +
      "  etag = excluded.etag, " +
      "  lastModified = excluded.lastModified, " +
      "  dateUpdated = excluded.dateUpdated",
    [sourceId, state.url, state.etag, state.lastModified, new Date().toISOString()],
  );
  span.end();
}

export async function SourcesFetchStateDataDelete(
  context: Span,
  sourceId: string,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesFetchStateDataDelete", context);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_fetch_state WHERE sourceId = ?",
    [sourceId],
  );
  span.end();
}
