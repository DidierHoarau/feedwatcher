import { Span } from "@opentelemetry/sdk-trace-base";
import * as path from "path";
import { Source } from "../model/Source";
import { OTelLogger, OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";

const logger = OTelLogger().createModuleLogger(path.basename(__filename));

const cacheUserCounts: any = {};
const cacheUserSavedCounts: any = {};

// Time-throttled count refresh: a burst of mutations triggers one immediate
// aggregate refresh plus at most one trailing refresh.
const COUNT_REFRESH_THROTTLE_MS = 2000;
const countRefreshState: any = {};

export async function SourcesDataGet(
  context: Span,
  sourceId: string,
): Promise<Source> {
  const span = OTelTracer().startSpan("SourcesDataGet", context);
  const sourceRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM sources WHERE id = ?",
    [sourceId],
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
  userId: string,
): Promise<Source[]> {
  const span = OTelTracer().startSpan("SourcesDataListForUser", context);
  const sourcesRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM sources WHERE userId = ?",
    [userId],
  );
  const sources = [];
  for (const sourceRaw of sourcesRaw) {
    sources.push(fromRaw(sourceRaw));
  }
  span.end();
  return sources;
}

export async function SourcesDataListCountsForUser(
  context: Span,
  userId: string,
  skipCache = false,
): Promise<any[]> {
  const span = OTelTracer().startSpan("SourcesDataListCountsForUser", context);
  if (cacheUserCounts[userId] && !skipCache) {
    span.setAttribute("cached", true);
    span.end();
    return cacheUserCounts[userId];
  }
  cacheUserCounts[userId] = await DbUtilsQuerySQL(
    span,
    "SELECT COUNT(id) as unreadCount, sourceId FROM sources_items " +
      "WHERE sourceId IN (" +
      "    SELECT id FROM sources " +
      "    WHERE userId = ? " +
      "  ) " +
      "  AND status = ? " +
      "GROUP BY sourceId ",
    [userId, "unread"],
  );
  span.end();
  return cacheUserCounts[userId];
}

export async function SourcesDataListCountsSavedForUser(
  context: Span,
  userId: string,
  skipCache = false,
): Promise<any[]> {
  const span = OTelTracer().startSpan(
    "SourcesDataListCountsSavedForUser",
    context,
  );
  if (cacheUserSavedCounts[userId] && !skipCache) {
    span.setAttribute("cached", true);
    span.end();
    return cacheUserSavedCounts[userId];
  }
  cacheUserSavedCounts[userId] = await DbUtilsQuerySQL(
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
    [userId],
  );
  span.end();
  return cacheUserSavedCounts[userId];
}

export async function SourcesDataListAll(context: Span): Promise<Source[]> {
  const span = OTelTracer().startSpan("SourcesDataListAll", context);
  const sourcesRaw = await DbUtilsQuerySQL(span, `SELECT * FROM sources`);
  const sources = [];
  for (const sourceRaw of sourcesRaw) {
    sources.push(fromRaw(sourceRaw));
  }
  span.end();
  return sources;
}

export async function SourcesDataAdd(
  context: Span,
  source: Source,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesDataAdd", context);
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id,userId,name,info) VALUES (?,?,?,?)",
    [source.id, source.userId, source.name, JSON.stringify(source.info)],
  );
  span.end();
}

export async function SourcesDataUpdate(
  context: Span,
  source: Source,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesDataUpdate", context);
  await DbUtilsExecSQL(
    span,
    "UPDATE sources SET name = ?, info = ? WHERE id = ?",
    [source.name, JSON.stringify(source.info), source.id],
  );
  span.end();
}

export async function SourcesDataDelete(
  context: Span,
  sourceId: string,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesDataDelete", context);
  const source = await SourcesDataGet(span, sourceId);
  await DbUtilsExecSQL(span, "DELETE FROM sources WHERE id = ?", [sourceId]);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_items WHERE sourceId = ?",
    [sourceId],
  );
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_labels WHERE sourceId = ?",
    [sourceId],
  );
  SourcesDataInvalidateUserCache(span, source.userId);
  span.end();
}

export async function SourcesDataInvalidateUserCache(
  context: Span,
  userId: string,
): Promise<void> {
  // Evict immediately so no reader can observe stale counts.
  delete cacheUserCounts[userId];
  delete cacheUserSavedCounts[userId];

  const state = countRefreshState[userId] || { lastRefresh: 0, timer: null };
  countRefreshState[userId] = state;
  const elapsed = Date.now() - state.lastRefresh;

  if (elapsed >= COUNT_REFRESH_THROTTLE_MS && !state.timer) {
    state.lastRefresh = Date.now();
    await refreshUserCountsCaches(context, userId);
    return;
  }

  if (!state.timer) {
    // Inside the throttle window: schedule a single trailing refresh so the
    // burst settles without one aggregate pair per mutation.
    state.timer = setTimeout(() => {
      state.timer = null;
      state.lastRefresh = Date.now();
      refreshUserCountsCaches(null, userId).catch((err) =>
        logger.error(`Counts refresh failed for user ${userId}`, err),
      );
    }, COUNT_REFRESH_THROTTLE_MS - elapsed);
    if (typeof state.timer.unref === "function") {
      state.timer.unref();
    }
  }
}

async function refreshUserCountsCaches(
  context: Span,
  userId: string,
): Promise<void> {
  const span = OTelTracer().startSpan("SourcesDataInvalidateUserCache", context);
  try {
    await SourcesDataListCountsForUser(span, userId, true);
    await SourcesDataListCountsSavedForUser(span, userId, true);
  } catch (err) {
    logger.error(`Counts refresh failed for user ${userId}`, err, span);
  } finally {
    span.end();
  }
}

export async function SourcesDataListCountsSaved(
  context: Span,
): Promise<number> {
  const span = OTelTracer().startSpan("SourcesDataListCountsSaved", context);
  const countRaw = await DbUtilsQuerySQL(
    span,
    "    SELECT COUNT(sources_items.id) as count " +
      "    FROM lists_items, sources_items " +
      "    WHERE lists_items.itemId = sources_items.id ",
  );

  let count = 0;
  if (countRaw.length > 0) {
    count = countRaw[0].count;
  }
  span.end();
  return count;
}

function fromRaw(sourceRaw: any): Source {
  const source = new Source();
  source.id = sourceRaw.id;
  source.userId = sourceRaw.userId;
  source.name = sourceRaw.name;
  source.info = JSON.parse(sourceRaw.info);
  return source;
}
