import { Span } from "@opentelemetry/sdk-trace-base";
import { v4 as uuidv4 } from "uuid";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";
import { SourceItemsDataGetForUser } from "./SourceItemsData";

const MAX_TAG_LENGTH = 200;

export async function ItemTagsDataListForUser(
  context: Span,
  userId: string,
): Promise<string[]> {
  const span = OTelTracer().startSpan("ItemTagsDataListForUser", context);
  const tagsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT DISTINCT name FROM sources_items_tags WHERE userId = ? ORDER BY name",
    [userId],
  );
  span.end();
  return tagsRaw.map((tagRaw: any) => tagRaw.name);
}

export async function ItemTagsDataGetForItem(
  context: Span,
  itemId: string,
  userId: string,
): Promise<string[]> {
  const span = OTelTracer().startSpan("ItemTagsDataGetForItem", context);
  const tagsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT name FROM sources_items_tags WHERE itemId = ? AND userId = ? ORDER BY name",
    [itemId, userId],
  );
  span.end();
  return tagsRaw.map((tagRaw: any) => tagRaw.name);
}

export async function ItemTagsDataSetForItem(
  context: Span,
  itemId: string,
  userId: string,
  tags: string[],
): Promise<void> {
  const span = OTelTracer().startSpan("ItemTagsDataSetForItem", context);
  // Ownership guard: tags are per-user, an item the user does not own is
  // never tagged (the route maps this to 404 via SourceItemsDataGetForUser).
  const sourceItem = await SourceItemsDataGetForUser(span, itemId, userId);
  if (!sourceItem) {
    span.end();
    return;
  }
  await DbUtilsExecSQL(
    span,
    "DELETE FROM sources_items_tags WHERE itemId = ? AND userId = ?",
    [itemId, userId],
  );
  for (const tag of normalizeTags(tags)) {
    await DbUtilsExecSQL(
      span,
      "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)",
      [uuidv4(), itemId, userId, tag],
    );
  }
  span.end();
}

export function normalizeTags(tags: string[]): string[] {
  const normalized: string[] = [];
  for (const tag of tags || []) {
    const value = String(tag || "")
      .trim()
      .slice(0, MAX_TAG_LENGTH);
    if (value.length === 0 || normalized.includes(value)) {
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}
