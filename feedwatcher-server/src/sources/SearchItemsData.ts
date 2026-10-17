import { Span } from "@opentelemetry/sdk-trace-base";
import { SearchItemsResult } from "../model/SearchItemsResult";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { DbUtilsGetType, DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";

const PAGE_SIZE = 50;

interface FtsContext {
  active: boolean;
  matchParam: string | null;
  rankExpr: string;
}

export async function SearchItemsDataListForUser(
  context: Span,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<SearchItemsResult> {
  const span = OTelTracer().startSpan("SearchItemsDataListForUser", context);
  const fts = getFtsContext(searchOptions);
  const { query: filterQuery, params: filterParams } =
    buildSharedFilterQuery(searchOptions, fts);
  const { query: cursorQuery, params: cursorParams } = getCursorQuery(
    searchOptions,
    fts,
  );
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name as sourceName " +
      getSavedStateQuery() +
      getFtsRankSelect(fts) +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      getFtsFromQuery(fts) +
      "WHERE sources.userId = ? " +
      filterQuery +
      cursorQuery +
      getOrderQuery(searchOptions, fts) +
      getLimitQuery(),
    [userId, ...filterParams, ...cursorParams],
  );
  const searchItemsResult = await getSearchResultsfromRaw(
    span,
    sourceItemsRaw,
    userId,
  );
  span.end();
  return searchItemsResult;
}

export async function SearchItemsDataListForSource(
  context: Span,
  sourceId: string,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<SearchItemsResult> {
  const span = OTelTracer().startSpan("SearchItemsDataListForSource", context);
  const fts = getFtsContext(searchOptions);
  const { query: filterQuery, params: filterParams } =
    buildSharedFilterQuery(searchOptions, fts);
  const { query: cursorQuery, params: cursorParams } = getCursorQuery(
    searchOptions,
    fts,
  );
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name as sourceName " +
      getSavedStateQuery() +
      getFtsRankSelect(fts) +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      getFtsFromQuery(fts) +
      "WHERE sources_items.sourceId = ? " +
      "  AND sources.id = ? " +
      filterQuery +
      cursorQuery +
      getOrderQuery(searchOptions, fts) +
      getLimitQuery(),
    [sourceId, sourceId, ...filterParams, ...cursorParams],
  );
  const searchItemsResult = await getSearchResultsfromRaw(
    span,
    sourceItemsRaw,
    userId,
  );
  span.end();
  return searchItemsResult;
}

export async function SearchItemsDataListItemsForLabel(
  context: Span,
  label: string,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<SearchItemsResult> {
  const span = OTelTracer().startSpan(
    "SearchItemsDataListItemsForLabel",
    context,
  );
  const fts = getFtsContext(searchOptions);
  const { query: filterQuery, params: filterParams } =
    buildSharedFilterQuery(searchOptions, fts);
  const { query: cursorQuery, params: cursorParams } = getCursorQuery(
    searchOptions,
    fts,
  );
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name AS sourceName " +
      getSavedStateQuery() +
      getFtsRankSelect(fts) +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      getFtsFromQuery(fts) +
      "WHERE sources_items.sourceId IN ( " +
      "    SELECT sources.id " +
      "    FROM sources, sources_labels " +
      "    WHERE sources.userId = ? " +
      "          AND sources_labels.sourceId = sources.id AND sources_labels.name LIKE ? " +
      "  ) " +
      "  AND sources.userId = ? " +
      filterQuery +
      cursorQuery +
      getOrderQuery(searchOptions, fts) +
      getLimitQuery(),
    [
      userId,
      `${label}%`,
      userId,
      ...filterParams,
      ...cursorParams,
    ],
  );
  const searchItemsResult = await getSearchResultsfromRaw(
    span,
    sourceItemsRaw,
    userId,
  );
  span.end();
  return searchItemsResult;
}

// Private Functions

// SQLite full-text search context: when a pattern is set (and the database is
// SQLite, the only engine with FTS5 available here) items are matched through
// the external-content items_fts index instead of a substring LIKE.
function getFtsContext(searchOptions: SearchItemsOptions): FtsContext {
  const rankExpr = "bm25(items_fts, 10.0, 1.0)";
  const pattern = (searchOptions.pattern || "").trim();
  if (pattern.length > 0 && DbUtilsGetType() === "sqlite") {
    const matchParam = buildFtsMatchString(pattern);
    if (matchParam) {
      return { active: true, matchParam, rankExpr };
    }
  }
  return { active: false, matchParam: null, rankExpr };
}

// Prefix-match each whitespace-separated token ("week" matches "weeks"),
// ANDed together. Quotes and other FTS syntax characters are stripped to
// keep the query string well-formed.
function buildFtsMatchString(pattern: string): string | null {
  const tokens = pattern
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => `"${token}"*`).join(" ");
}

function getFtsFromQuery(fts: FtsContext): string {
  return fts.active ? "JOIN items_fts ON items_fts.rowid = sources_items.rowid " : "";
}

function getFtsRankSelect(fts: FtsContext): string {
  return fts.active ? `, ${fts.rankExpr} AS ftsRank ` : "";
}

function buildSharedFilterQuery(
  searchOptions: SearchItemsOptions,
  fts: FtsContext,
): { query: string; params: string[] } {
  let query = getStatusFilterQuery(searchOptions);
  const params: string[] = [];
  if (searchOptions.minDate) {
    query += "  AND sources_items.datePublished >= ? ";
    params.push(searchOptions.minDate.toISOString());
  }
  if (searchOptions.maxDate) {
    query += "  AND sources_items.datePublished <= ? ";
    params.push(searchOptions.maxDate.toISOString());
  }
  if (searchOptions.tagName && searchOptions.tagName.trim().length > 0) {
    query +=
      "  AND EXISTS ( " +
      "    SELECT 1 FROM sources_items_tags " +
      "    WHERE sources_items_tags.itemId = sources_items.id " +
      "          AND sources_items_tags.userId = sources.userId " +
      "          AND sources_items_tags.name = ? " +
      "  ) ";
    params.push(searchOptions.tagName.trim());
  }
  if (fts.active) {
    query += "  AND items_fts MATCH ? ";
    params.push(fts.matchParam);
  } else {
    const pattern = (searchOptions.pattern || "").trim();
    if (pattern.length > 0) {
      query += "  AND (sources_items.title LIKE ? OR sources_items.content LIKE ?) ";
      params.push(`%${pattern}%`, `%${pattern}%`);
    }
  }
  return { query, params };
}

function getCursorQuery(
  searchOptions: SearchItemsOptions,
  fts: FtsContext,
): { query: string; params: any[] } {
  const cursor = searchOptions.cursor;
  if (!cursor) {
    return { query: "", params: [] };
  }
  if (
    searchOptions.sort === "relevance" &&
    fts.active &&
    typeof cursor.rank === "number"
  ) {
    return {
      query: `  AND (${fts.rankExpr} > ? OR (${fts.rankExpr} = ? AND sources_items.id > ?)) `,
      params: [cursor.rank, cursor.rank, cursor.id],
    };
  }
  if (searchOptions.sort === "date_asc") {
    return {
      query:
        "  AND (sources_items.datePublished > ? OR (sources_items.datePublished = ? AND sources_items.id > ?)) ",
      params: [
        cursor.datePublished,
        cursor.datePublished,
        cursor.id,
      ],
    };
  }
  return {
    query:
      "  AND (sources_items.datePublished < ? OR (sources_items.datePublished = ? AND sources_items.id < ?)) ",
    params: [cursor.datePublished, cursor.datePublished, cursor.id],
  };
}

function getOrderQuery(searchOptions: SearchItemsOptions, fts: FtsContext): string {
  if (searchOptions.sort === "relevance" && fts.active) {
    return `ORDER BY ${fts.rankExpr} ASC, sources_items.id ASC `;
  }
  if (searchOptions.sort === "date_asc") {
    return "ORDER BY sources_items.datePublished ASC, sources_items.id ASC ";
  }
  return "ORDER BY sources_items.datePublished DESC, sources_items.id DESC ";
}

function getStatusFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.filterStatus === SourceItemStatus.unread) {
    return "  AND sources_items.status = 'unread' ";
  }
  if (searchOptions.filterStatus === SourceItemStatus.read) {
    return "  AND sources_items.status = 'read' ";
  }
  return "";
}

function getLimitQuery(): string {
  return `LIMIT ${PAGE_SIZE + 1}`;
}

async function getSearchResultsfromRaw(
  span: Span,
  sourceItemsRaw: any,
  userId: string,
): Promise<SearchItemsResult> {
  const searchItemsResult = new SearchItemsResult();
  for (const sourceItemRaw of sourceItemsRaw) {
    searchItemsResult.sourceItems.push(SourceItem.fromRaw(sourceItemRaw));
  }
  if (searchItemsResult.sourceItems.length > PAGE_SIZE) {
    searchItemsResult.sourceItems.pop();
    searchItemsResult.pageHasMore = true;
  }
  await hydrateTags(span, userId, searchItemsResult.sourceItems);
  await hydratePlayback(span, userId, searchItemsResult.sourceItems);
  if (searchItemsResult.sourceItems.length > 0) {    const lastItem =
      searchItemsResult.sourceItems[searchItemsResult.sourceItems.length - 1];
    const lastRaw = sourceItemsRaw[searchItemsResult.sourceItems.length - 1];
    searchItemsResult.nextCursor = {
      datePublished: new Date(lastItem.datePublished).toISOString(),
      id: lastItem.id,
      ...(lastRaw.ftsRank !== undefined && lastRaw.ftsRank !== null
        ? { rank: Number(lastRaw.ftsRank) }
        : {}),
    };
  }
  return searchItemsResult;
}

// Batched tag hydration: one query per page instead of per card.
async function hydrateTags(
  span: Span,
  userId: string,
  sourceItems: SourceItem[],
): Promise<void> {
  if (sourceItems.length === 0) {
    return;
  }
  const itemIds = sourceItems.map((item) => item.id);
  const placeholders = itemIds.map(() => "?").join(",");
  const tagsRaw = await DbUtilsQuerySQL(
    span,
    `SELECT itemId, name FROM sources_items_tags WHERE userId = ? AND itemId IN (${placeholders}) ORDER BY name`,
    [userId, ...itemIds],
  );
  const tagsByItemId = new Map<string, string[]>();
  for (const tagRaw of tagsRaw) {
    if (!tagsByItemId.has(tagRaw.itemId)) {
      tagsByItemId.set(tagRaw.itemId, []);
    }
    tagsByItemId.get(tagRaw.itemId).push(tagRaw.name);
  }
  for (const sourceItem of sourceItems) {
    sourceItem.tags = tagsByItemId.get(sourceItem.id) || [];
  }
}

// Batched playback-position hydration: one query per page instead of per card.
async function hydratePlayback(
  span: Span,
  userId: string,
  sourceItems: SourceItem[],
): Promise<void> {
  if (sourceItems.length === 0) {
    return;
  }
  const itemIds = sourceItems.map((item) => item.id);
  const placeholders = itemIds.map(() => "?").join(",");
  const playbackRaw = await DbUtilsQuerySQL(
    span,
    `SELECT itemId, positionSeconds, durationSeconds FROM podcast_playback WHERE userId = ? AND itemId IN (${placeholders})`,
    [userId, ...itemIds],
  );
  const playbackByItemId = new Map<
    string,
    { positionSeconds: number; durationSeconds: number }
  >();
  for (const playback of playbackRaw) {
    playbackByItemId.set(playback.itemId, {
      positionSeconds: Number(playback.positionSeconds) || 0,
      durationSeconds: Number(playback.durationSeconds) || 0,
    });
  }
  for (const sourceItem of sourceItems) {
    const playback = playbackByItemId.get(sourceItem.id);
    if (playback) {
      sourceItem.playbackPositionSeconds = playback.positionSeconds;
      sourceItem.playbackDurationSeconds = playback.durationSeconds;
    }
  }
}

function getSavedFromQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.isSaved) {
    return " JOIN lists_items ON sources_items.id = lists_items.itemId ";
  }
  return "";
}

// EXISTS (no row duplication — lists_items has no unique (itemId, userId)
// constraint) correlated on sources.userId, which every query above already
// constrains to the requesting user. Batched bookmark state replaces the
// per-card bookmark lookups.
function getSavedStateQuery(): string {
  return (
    ", EXISTS (SELECT 1 FROM lists_items " +
    "WHERE lists_items.itemId = sources_items.id " +
    "AND lists_items.userId = sources.userId) AS isSaved "
  );
}
