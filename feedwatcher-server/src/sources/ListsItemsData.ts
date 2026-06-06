import { Span } from "@opentelemetry/sdk-trace-base";
import { ListItem } from "../model/ListItem";
import { SourceItem } from "../model/SourceItem";
import { OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import { SourcesDataInvalidateUserCache } from "./SourcesData";

export async function ListsItemsDataAdd(
  context: Span,
  listItem: ListItem
): Promise<void> {
  const span = OTelTracer().startSpan("ListsItemsDataAdd", context);
  await DbUtilsExecSQL(
    span,
    "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)",
    [
      listItem.id,
      listItem.itemId,
      listItem.userId,
      listItem.name,
      JSON.stringify(listItem.info),
    ]
  );
  SourcesDataInvalidateUserCache(span, listItem.userId);
  span.end();
}

export async function ListsItemsDataDeleteForUser(
  context: Span,
  itemId: string,
  userId: string
): Promise<void> {
  const span = OTelTracer().startSpan("ListsItemsDataDeleteForUser", context);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM lists_items WHERE itemId = ? AND userId = ?",
    [itemId, userId]
  );
  SourcesDataInvalidateUserCache(span, userId);
  span.end();
}

export async function ListsItemsDataGetItemForUser(
  context: Span,
  itemId: string,
  userId: string
): Promise<SourceItem> {
  const span = OTelTracer().startSpan("ListsItemsDataGetItemForUser", context);
  const sourceItemRaw = await DbUtilsQuerySQL(
    span,
    "SELECT sources_items.* " +
      "FROM sources_items, lists_items " +
      "WHERE sources_items.id = ? " +
      "  AND lists_items.itemId = ? " +
      "  AND lists_items.userId = ? " +
      "ORDER BY datePublished DESC",
    [itemId, itemId, userId]
  );
  let sourceItem: SourceItem = null;
  if (sourceItemRaw.length > 0) {
    sourceItem = SourceItem.fromRaw(sourceItemRaw[0]);
  }
  span.end();
  return sourceItem;
}
