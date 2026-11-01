import { Span } from "@opentelemetry/sdk-trace";
import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";

export interface SourceExport {
  id: string;
  name: string;
  info: any;
  labels: string[];
}

export interface SourceItemExport {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  url: string;
  status: string;
  datePublished: string;
  thumbnail: string | null;
  info: any;
}

export async function SourcesExportDataListForUser(
  context: Span,
  userId: string,
): Promise<SourceExport[]> {
  const span = OTelTracer().startSpan(
    "SourcesExportDataListForUser",
    context,
  );
  const sourceLabels = await SourceLabelsDataListForUser(span, userId);
  const sourcesById = new Map<string, { source: SourceExport; labels: Set<string> }>();
  for (const row of sourceLabels as any[]) {
    let entry = sourcesById.get(row.sourceId);
    if (!entry) {
      entry = {
        source: {
          id: row.sourceId,
          name: row.sourceName,
          info: row.sourceInfo ?? {},
          labels: [],
        },
        labels: new Set<string>(),
      };
      sourcesById.set(row.sourceId, entry);
    }
    if (row.labelName) {
      entry.labels.add(row.labelName);
    }
  }
  const sources: SourceExport[] = [];
  for (const entry of sourcesById.values()) {
    entry.source.labels = [...entry.labels].sort();
    sources.push(entry.source);
  }
  sources.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  span.end();
  return sources;
}

export async function SourcesExportDataItemsForUser(
  context: Span,
  userId: string,
  afterId: string,
  limit: number,
): Promise<SourceItemExport[]> {
  const span = OTelTracer().startSpan(
    "SourcesExportDataItemsForUser",
    context,
  );
  const rows = await DbUtilsQuerySQL(
    span,
    "SELECT sources_items.id, sources_items.sourceId, sources_items.title, " +
      "  sources_items.content, sources_items.url, sources_items.status, " +
      "  sources_items.datePublished, sources_items.thumbnail, sources_items.info " +
      "FROM sources_items " +
      "  JOIN sources ON sources.id = sources_items.sourceId " +
      "WHERE sources.userId = ? AND sources_items.id > ? " +
      "ORDER BY sources_items.id " +
      "LIMIT ?",
    [userId, afterId, limit],
  );
  const items = rows.map((row: any) => {
    let info: any = {};
    try {
      info = JSON.parse(row.info) || {};
    } catch {
      info = {};
    }
    return {
      id: row.id,
      sourceId: row.sourceId,
      title: row.title,
      content: row.content,
      url: row.url,
      status: row.status,
      datePublished: row.datePublished,
      thumbnail: row.thumbnail ?? null,
      info,
    };
  });
  span.end();
  return items;
}
