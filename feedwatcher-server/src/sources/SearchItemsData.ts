import { Span } from "@opentelemetry/sdk-trace-base";
import { SearchItemsResult } from "../model/SearchItemsResult";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItem } from "../model/SourceItem";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "../utils-std-ts/SqlDbUtils";
import { SourceItemStatus } from "../model/SourceItemStatus";

const PAGE_SIZE = 50;

export class SearchItemsData {
  //
  public static async listForUser(
    context: Span,
    userId: string,
    searchOptions: SearchItemsOptions
  ): Promise<SearchItemsResult> {
    const span = StandardTracer.startSpan("SearchItemsData_getForUser", context);
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name as sourceName " +
        "FROM sources_items " +
        "JOIN sources ON sources_items.sourceId = sources.id " +
        getSavedFromQuery(searchOptions) +
        "WHERE sources.userId = ? " +
        getStatusFilterQuery(searchOptions) +
        "ORDER BY datePublished DESC " +
        getPageQuery(searchOptions),
      [userId]
    );
    const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
    span.end();
    return searchItemsResult;
  }

  public static async listForSource(
    context: Span,
    sourceId: string,
    searchOptions: SearchItemsOptions
  ): Promise<SearchItemsResult> {
    const span = StandardTracer.startSpan("SearchItemsData_getLastForSource", context);
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name as sourceName " +
        "FROM sources_items " +
        "JOIN sources ON sources_items.sourceId = sources.id " +
        getSavedFromQuery(searchOptions) +
        "WHERE sources_items.sourceId = ? " +
        "  AND sources.id = ? " +
        getAgeFilterQuery(searchOptions) +
        getStatusFilterQuery(searchOptions) +
        "ORDER BY datePublished DESC " +
        getPageQuery(searchOptions),
      [sourceId, sourceId]
    );
    const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
    span.end();
    return searchItemsResult;
  }

  public static async listItemsForLabel(
    context: Span,
    label: string,
    userId: string,
    searchOptions: SearchItemsOptions
  ): Promise<SearchItemsResult> {
    const span = StandardTracer.startSpan("SourceItemsData_listItemsForLabel", context);
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name AS sourceName " +
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
        getAgeFilterQuery(searchOptions) +
        "  AND sources.userId = ? " +
        "ORDER BY datePublished DESC " +
        getPageQuery(searchOptions),
      [userId, `${label}%`, userId]
    );
    const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
    span.end();
    return searchItemsResult;
  }
}

function getPageQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.page < 0) {
    return "";
  }
  return `LIMIT ${PAGE_SIZE + 1} OFFSET ${(searchOptions.page - 1) * PAGE_SIZE}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSearchResultsfromRaw(sourceItemsRaw: any): SearchItemsResult {
  const searchItemsResult = new SearchItemsResult();
  for (const sourceItem of sourceItemsRaw) {
    searchItemsResult.sourceItems.push(SourceItem.fromRaw(sourceItem));
  }
  if (searchItemsResult.sourceItems.length > PAGE_SIZE) {
    searchItemsResult.sourceItems.pop();
    searchItemsResult.pageHasMore = true;
  }
  return searchItemsResult;
}

function getStatusFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.filterStatus === SourceItemStatus.unread) {
    return "  AND sources_items.status = 'unread' ";
  }
  return "";
}

function getAgeFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.maxDate) {
    return `  AND sources_items.datePublished <= '${searchOptions.maxDate.toISOString()}' `;
  }
  return "";
}

function getSavedFromQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.isSaved) {
    return " JOIN lists_items ON sources_items.id = lists_items.itemId ";
  }
  return "";
}
