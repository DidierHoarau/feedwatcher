import { Span } from "@opentelemetry/sdk-trace";
import * as path from "path";
import { Source } from "../model/Source";
import { OTelLogger, OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import { SourcesFetchStateDataDelete } from "./SourcesFetchStateData";

const logger = OTelLogger().createModuleLogger(path.basename(__filename));

const cacheUserCounts: any = {};
const cacheUserSavedCounts: any = {};

type UserItemCounts = { read: number; unread: number; bookmarked: number };
// Process-wide item totals maintained from the per-user refresh below, so the
// scheduler gauges never scan the tables. Reconciled at startup and after the
// daily orphan cleanup.
const userItemCounts = new Map<string, UserItemCounts>();

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
  await SourcesFetchStateDataDelete(span, sourceId);
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
    const [, savedRows, totals] = await Promise.all([
      SourcesDataListCountsForUser(span, userId, true),
      SourcesDataListCountsSavedForUser(span, userId, true),
      SourcesDataQueryUserTotals(span, userId),
    ]);
    userItemCounts.set(userId, {
      read: totals.read,
      unread: totals.unread,
      bookmarked: savedRows.reduce(
        (sum: number, row: any) => sum + Number(row.savedCount ?? 0),
        0,
      ),
    });
  } catch (err) {
    logger.error(`Counts refresh failed for user ${userId}`, err, span);
  } finally {
    span.end();
  }
}

async function SourcesDataQueryUserTotals(
  context: Span,
  userId: string,
): Promise<{ read: number; unread: number }> {
  const span = OTelTracer().startSpan("SourcesDataQueryUserTotals", context);
  const totalsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT COUNT(CASE WHEN status = 'unread' THEN 1 END) AS unreadCount, " +
      "       COUNT(CASE WHEN status = 'read' THEN 1 END) AS readCount " +
      "FROM sources_items " +
      "WHERE sourceId IN (SELECT id FROM sources WHERE userId = ?)",
    [userId],
  );
  span.end();
  const totals = totalsRaw.length > 0 ? totalsRaw[0] : {};
  return {
    read: Number(totals.readCount ?? 0),
    unread: Number(totals.unreadCount ?? 0),
  };
}

// Rebuilds the process-wide item totals in one pass (startup and after the
// daily orphan cleanup); never called per scheduler cycle.
export async function SourcesDataWarmItemCounts(context: Span): Promise<void> {
  const span = OTelTracer().startSpan("SourcesDataWarmItemCounts", context);
  try {
    const [statusRows, savedRows] = await Promise.all([
      DbUtilsQuerySQL(
        span,
        "SELECT sources.userId AS userId, " +
          "       COUNT(CASE WHEN sources_items.status = 'unread' THEN 1 END) AS unreadCount, " +
          "       COUNT(CASE WHEN sources_items.status = 'read' THEN 1 END) AS readCount " +
          "FROM sources_items, sources " +
          "WHERE sources_items.sourceId = sources.id " +
          "GROUP BY sources.userId",
      ),
      DbUtilsQuerySQL(
        span,
        "SELECT sources.userId AS userId, " +
          "       COUNT(DISTINCT lists_items.itemId) AS savedCount " +
          "FROM lists_items, sources_items, sources " +
          "WHERE lists_items.itemId = sources_items.id " +
          "      AND sources_items.sourceId = sources.id " +
          "GROUP BY sources.userId",
      ),
    ]);
    userItemCounts.clear();
    const ensureEntry = (userId: string): UserItemCounts => {
      let entry = userItemCounts.get(userId);
      if (!entry) {
        entry = { read: 0, unread: 0, bookmarked: 0 };
        userItemCounts.set(userId, entry);
      }
      return entry;
    };
    for (const row of statusRows) {
      const entry = ensureEntry(row.userId);
      entry.read = Number(row.readCount ?? 0);
      entry.unread = Number(row.unreadCount ?? 0);
    }
    for (const row of savedRows) {
      ensureEntry(row.userId).bookmarked = Number(row.savedCount ?? 0);
    }
  } finally {
    span.end();
  }
}

export function SourcesDataGetGlobalItemCounts(): {
  read: number;
  unread: number;
  total: number;
  bookmarked: number;
} {
  let read = 0;
  let unread = 0;
  let bookmarked = 0;
  for (const counts of userItemCounts.values()) {
    read += counts.read;
    unread += counts.unread;
    bookmarked += counts.bookmarked;
  }
  return { read, unread, total: read + unread, bookmarked };
}

export function SourcesDataResetCountsForTests(): void {
  for (const userId of Object.keys(countRefreshState)) {
    const state = countRefreshState[userId];
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    delete countRefreshState[userId];
  }
  for (const userId of Object.keys(cacheUserCounts)) {
    delete cacheUserCounts[userId];
  }
  for (const userId of Object.keys(cacheUserSavedCounts)) {
    delete cacheUserSavedCounts[userId];
  }
  userItemCounts.clear();
}

function fromRaw(sourceRaw: any): Source {
  const source = new Source();
  source.id = sourceRaw.id;
  source.userId = sourceRaw.userId;
  source.name = sourceRaw.name;
  source.info = JSON.parse(sourceRaw.info);
  return source;
}
