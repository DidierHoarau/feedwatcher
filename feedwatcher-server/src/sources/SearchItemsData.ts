import { Span } from "@opentelemetry/sdk-trace-base";
import { SearchItemsResult } from "../model/SearchItemsResult";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItem } from "../model/SourceItem";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";

const PAGE_SIZE = 50;

export async function SearchItemsDataListForUser(
  context: Span,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<SearchItemsResult> {
  const span = OTelTracer().startSpan("SearchItemsDataListForUser", context);
  const { query: patternQuery, params: patternParams } =
    getPatternFilterQuery(searchOptions);
  const { query: cursorQuery, params: cursorParams } =
    getCursorQuery(searchOptions);
  const { query: minDateQuery, params: minDateParams } =
    getMinDateFilterQuery(searchOptions);
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name as sourceName " +
      getSavedStateQuery() +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      "WHERE sources.userId = ? " +
      getStatusFilterQuery(searchOptions) +
      minDateQuery +
      patternQuery +
      cursorQuery +
      "ORDER BY sources_items.datePublished DESC, sources_items.id DESC " +
      getLimitQuery(),
    [userId, ...minDateParams, ...patternParams, ...cursorParams],
  );
  const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
  span.end();
  return searchItemsResult;
}

export async function SearchItemsDataListForSource(
  context: Span,
  sourceId: string,
  searchOptions: SearchItemsOptions,
): Promise<SearchItemsResult> {
  const span = OTelTracer().startSpan("SearchItemsDataListForSource", context);
  const { query: patternQuery, params: patternParams } =
    getPatternFilterQuery(searchOptions);
  const { query: cursorQuery, params: cursorParams } =
    getCursorQuery(searchOptions);
  const { query: ageQuery, params: ageParams } =
    getAgeFilterQuery(searchOptions);
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name as sourceName " +
      getSavedStateQuery() +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      "WHERE sources_items.sourceId = ? " +
      "  AND sources.id = ? " +
      ageQuery +
      getStatusFilterQuery(searchOptions) +
      patternQuery +
      cursorQuery +
      "ORDER BY sources_items.datePublished DESC, sources_items.id DESC " +
      getLimitQuery(),
    [sourceId, sourceId, ...ageParams, ...patternParams, ...cursorParams],
  );
  const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
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
  const { query: patternQuery, params: patternParams } =
    getPatternFilterQuery(searchOptions);
  const { query: cursorQuery, params: cursorParams } =
    getCursorQuery(searchOptions);
  const { query: ageQuery, params: ageParams } =
    getAgeFilterQuery(searchOptions);
  const sourceItemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT sources_items.*, sources.name AS sourceName " +
      getSavedStateQuery() +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      getSavedFromQuery(searchOptions) +
      "WHERE sources_items.sourceId IN ( " +
      "    SELECT sources.id " +
      "    FROM sources, sources_labels " +
      "    WHERE sources.userId = ? " +
      "          AND sources_labels.sourceId = sources.id AND sources_labels.name LIKE ? " +
      "  ) " +
      getStatusFilterQuery(searchOptions) +
      ageQuery +
      "  AND sources.userId = ? " +
      patternQuery +
      cursorQuery +
      "ORDER BY sources_items.datePublished DESC, sources_items.id DESC " +
      getLimitQuery(),
    [
      userId,
      `${label}%`,
      ...ageParams,
      userId,
      ...patternParams,
      ...cursorParams,
    ],
  );
  const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
  span.end();
  return searchItemsResult;
}

// Private Functions

function getCursorQuery(searchOptions: SearchItemsOptions): {
  query: string;
  params: string[];
} {
  if (searchOptions.cursor) {
    return {
      query:
        "  AND (sources_items.datePublished < ? OR (sources_items.datePublished = ? AND sources_items.id < ?)) ",
      params: [
        searchOptions.cursor.datePublished,
        searchOptions.cursor.datePublished,
        searchOptions.cursor.id,
      ],
    };
  }
  return { query: "", params: [] };
}

function getLimitQuery(): string {
  return `LIMIT ${PAGE_SIZE + 1}`;
}

function getSearchResultsfromRaw(sourceItemsRaw: any): SearchItemsResult {
  const searchItemsResult = new SearchItemsResult();
  for (const sourceItem of sourceItemsRaw) {
    searchItemsResult.sourceItems.push(SourceItem.fromRaw(sourceItem));
  }
  if (searchItemsResult.sourceItems.length > PAGE_SIZE) {
    searchItemsResult.sourceItems.pop();
    searchItemsResult.pageHasMore = true;
  }
  if (searchItemsResult.sourceItems.length > 0) {
    const lastItem =
      searchItemsResult.sourceItems[searchItemsResult.sourceItems.length - 1];
    searchItemsResult.nextCursor = {
      datePublished: new Date(lastItem.datePublished).toISOString(),
      id: lastItem.id,
    };
  }
  return searchItemsResult;
}

function getStatusFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.filterStatus === SourceItemStatus.unread) {
    return "  AND sources_items.status = 'unread' ";
  }
  return "";
}

function getAgeFilterQuery(searchOptions: SearchItemsOptions): {
  query: string;
  params: string[];
} {
  if (searchOptions.maxDate) {
    return {
      query: "  AND sources_items.datePublished <= ? ",
      params: [searchOptions.maxDate.toISOString()],
    };
  }
  return { query: "", params: [] };
}

function getMinDateFilterQuery(searchOptions: SearchItemsOptions): {
  query: string;
  params: string[];
} {
  if (searchOptions.minDate) {
    return {
      query: "  AND sources_items.datePublished >= ? ",
      params: [searchOptions.minDate.toISOString()],
    };
  }
  return { query: "", params: [] };
}

function getPatternFilterQuery(searchOptions: SearchItemsOptions): {
  query: string;
  params: string[];
} {
  if (searchOptions.pattern && searchOptions.pattern.trim().length > 0) {
    const likePattern = `%${searchOptions.pattern.trim()}%`;
    return {
      query:
        "  AND (sources_items.title LIKE ? OR sources_items.content LIKE ?) ",
      params: [likePattern, likePattern],
    };
  }
  return { query: "", params: [] };
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
