import { Span } from "@opentelemetry/sdk-trace-base";
import { Source } from "../model/Source";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { TimeoutWait } from "../utils-std-ts/Timeout";
import {
  SqlDbUtilsExecSQL,
  SqlDbUtilsQuerySQL,
} from "../utils-std-ts/SqlDbUtils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheUserCounts: any = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheUserSavedCounts: any = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheInProgress: any = {};

export async function SourcesDataGet(
  context: Span,
  sourceId: string
): Promise<Source> {
  const span = StandardTracerStartSpan("SourcesDataGet", context);
  const sourceRaw = await SqlDbUtilsQuerySQL(
    span,
    "SELECT * FROM sources WHERE id = ?",
    [sourceId]
  );
  let source: Source = null;
  if (sourceRaw.length > 0) {
    source = fromRaw(sourceRaw[0]);
  }
  span.end();
  return source;
}

export async function SourcesDataListForUser(
  context: Span,
  userId: string
): Promise<Source[]> {
  const span = StandardTracerStartSpan("SourcesDataListForUser", context);
  const sourcesRaw = await SqlDbUtilsQuerySQL(
    span,
    `SELECT * FROM sources WHERE userId = '${userId}'`
  );
  const sources = [];
  for (const sourceRaw of sourcesRaw) {
    sources.push(fromRaw(sourceRaw));
  }
  span.end();
  return sources;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function SourcesDataListCountsForUser(
  context: Span,
  userId: string,
  skipCache = false
): Promise<any[]> {
  const span = StandardTracerStartSpan("SourcesDataListCountsForUser", context);
  if (cacheUserCounts[userId] && !skipCache) {
    span.setAttribute("cached", true);
    span.end();
    return cacheUserCounts[userId];
  }
  cacheUserCounts[userId] = await SqlDbUtilsQuerySQL(
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
  return cacheUserCounts[userId];
}

export async function SourcesDataListCountsSavedForUser(
  context: Span,
  userId: string,
  skipCache = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const span = StandardTracerStartSpan(
    "SourcesDataListCountsSavedForUser",
    context
  );
  if (cacheUserSavedCounts[userId] && !skipCache) {
    span.setAttribute("cached", true);
    span.end();
    return cacheUserSavedCounts[userId];
  }
  cacheUserSavedCounts[userId] = await SqlDbUtilsQuerySQL(
    span,
    "SELECT COUNT(id) as savedCount, sourceId  " +
      "FROM sources_items " +
      "WHERE id IN (" +
      "    SELECT sources_items.id " +
      "    FROM lists_items, sources_items, sources " +
      "    WHERE lists_items.itemId = sources_items.id " +
      "          AND sources_items.sourceId = sources.id " +
      "          AND sources.userId = ? " +
      "  ) " +
      "GROUP BY sourceId ",
    [userId]
  );
  span.end();
  return cacheUserSavedCounts[userId];
}

export async function SourcesDataListAll(context: Span): Promise<Source[]> {
  const span = StandardTracerStartSpan("SourcesDataListAll", context);
  const sourcesRaw = await SqlDbUtilsQuerySQL(span, `SELECT * FROM sources`);
  const sources = [];
  for (const sourceRaw of sourcesRaw) {
    sources.push(fromRaw(sourceRaw));
  }
  span.end();
  return sources;
}

export async function SourcesDataAdd(
  context: Span,
  source: Source
): Promise<void> {
  const span = StandardTracerStartSpan("SourcesDataAdd", context);
  await SqlDbUtilsQuerySQL(
    span,
    "INSERT INTO sources (id,userId,name,info) VALUES (?,?,?,?)",
    [source.id, source.userId, source.name, JSON.stringify(source.info)]
  );
  span.end();
}

export async function SourcesDataUpdate(
  context: Span,
  source: Source
): Promise<void> {
  const span = StandardTracerStartSpan("SourcesDataUpdate", context);
  await SqlDbUtilsExecSQL(
    span,
    "UPDATE sources SET name = ?, info = ? WHERE id = ?",
    [source.name, JSON.stringify(source.info), source.id]
  );
  span.end();
}

export async function SourcesDataDelete(
  context: Span,
  sourceId: string
): Promise<void> {
  const span = StandardTracerStartSpan("SourcesDataDelete", context);
  const source = await SourcesDataGet(span, sourceId);
  await SqlDbUtilsExecSQL(span, "DELETE FROM sources WHERE id = ?", [sourceId]);
  await SqlDbUtilsExecSQL(
    span,
    "DELETE FROM sources_items WHERE sourceId = ?",
    [sourceId]
  );
  await SqlDbUtilsExecSQL(
    span,
    "DELETE FROM sources_labels WHERE sourceId = ?",
    [sourceId]
  );
  SourcesDataInvalidateUserCache(span, source.userId);
  span.end();
}

export async function SourcesDataInvalidateUserCache(
  context: Span,
  userId: string
): Promise<void> {
  if (cacheInProgress[userId]) {
    cacheInProgress[userId] = 0;
  }
  if (cacheInProgress[userId] > 0) {
    cacheInProgress[userId]++;
    return;
  }
  const span = StandardTracerStartSpan("StandardTracerStartSpan", context);
  SourcesDataListCountsForUser(span, userId, true);
  SourcesDataListCountsSavedForUser(span, userId, true);
  span.end();
  TimeoutWait(1000).finally(() => {
    if (cacheInProgress[userId] > 1) {
      const newSpan = StandardTracerStartSpan("StandardTracerStartSpan");
      cacheInProgress[userId] = 0;
      SourcesDataInvalidateUserCache(context, userId).finally(() => {
        newSpan.end();
      });
    } else {
      cacheInProgress[userId] = 0;
    }
  });
}

export async function SourcesDataListCountsSaved(
  context: Span
): Promise<number> {
  const span = StandardTracerStartSpan("SourcesDataListCountsSaved", context);
  const countRaw = await SqlDbUtilsQuerySQL(
    span,
    "    SELECT COUNT(sources_items.id) as count " +
      "    FROM lists_items, sources_items " +
      "    WHERE lists_items.itemId = sources_items.id "
  );

  let count = 0;
  if (countRaw.length > 0) {
    count = countRaw[0].count;
  }
  span.end();
  return count;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRaw(sourceRaw: any): Source {
  const source = new Source();
  source.id = sourceRaw.id;
  source.userId = sourceRaw.userId;
  source.name = sourceRaw.name;
  source.info = JSON.parse(sourceRaw.info);
  return source;
}
