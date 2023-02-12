import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { SearchItemsResult } from "../model/SearchItemsResult";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItem } from "../model/SourceItem";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

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
        "FROM sources_items, sources " +
        "WHERE sources.userId = ? " +
        "  AND sources_items.status = 'unread' " +
        "  AND sources.id = sources_items.sourceId  " +
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
        "FROM sources_items, sources " +
        "WHERE sources_items.sourceId = ? " +
        "  AND sources.id = ? " +
        "  AND status = 'unread' " +
        "  AND sources.id = sources_items.sourceId " +
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
        "FROM sources_items, sources " +
        "WHERE sources_items.sourceId IN ( " +
        "    SELECT sources.id " +
        "    FROM sources, sources_labels " +
        "    WHERE sources.userId = ? AND sources_labels.sourceId = sources.id AND sources_labels.name = ? " +
        "  ) " +
        "  AND sources_items.status = 'unread' " +
        "  AND sources.userId = ? " +
        "  AND sources_items.sourceId = sources.id " +
        "ORDER BY datePublished DESC " +
        getPageQuery(searchOptions),
      [userId, label, userId]
    );
    const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
    span.end();
    return searchItemsResult;
  }

  public static async listItemsForLists(
    context: Span,
    userId: string,
    searchOptions: SearchItemsOptions
  ): Promise<SearchItemsResult> {
    const span = StandardTracer.startSpan("ListsItemsData_listItemsForUser", context);
    const sourceItemsRaw = await SqlDbutils.querySQL(
      span,
      "SELECT sources_items.*, sources.name as sourceName " +
        "FROM sources_items, lists_items, sources " +
        "WHERE sources_items.id = lists_items.itemId  " +
        "  AND lists_items.userId = ? " +
        "  AND sources.id = sources_items.sourceId " +
        "  AND sources.userId = ? " +
        "ORDER BY datePublished DESC " +
        getPageQuery(searchOptions),
      [userId, userId]
    );
    const searchItemsResult = getSearchResultsfromRaw(sourceItemsRaw);
    span.end();
    return searchItemsResult;
  }
}

function getPageQuery(searchOptions: SearchItemsOptions): string {
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
