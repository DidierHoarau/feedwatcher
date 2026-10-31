import { Span } from "@opentelemetry/sdk-trace";
import {
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsSetOTel,
} from "@devopsplaybook.io/common-utils";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Config } from "../Config";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import {
  ItemTagsDataGetForItem,
  ItemTagsDataListForUser,
  ItemTagsDataSetForItem,
  normalizeTags,
} from "./ItemTagsData";
import { SourceItemsDataDelete, SourceItemsDataCleanupOrphans } from "./SourceItemsData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-item-tags-"));
  tempDirs.push(dir);
  const config = new Config();
  config.DATA_DIR = dir;
  config.DATABASE_TYPE = "sqlite";
  span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);
});

afterEach(() => {
  const db = DbUtilsGetDatabase();
  if (db && typeof db.close === "function") {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

async function seedItem(
  itemId: string,
  sourceId: string,
  userId: string,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [sourceId, userId, "Test Source", JSON.stringify({})]
  );
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [itemId, sourceId, "A title", "content", "https://x.com/a", "unread", new Date().toISOString(), "", "{}"]
  );
}

describe("ItemTagsData", () => {
  test("set, get and list tags for an item", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["news", "tech"]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-1")).toEqual([
      "news",
      "tech",
    ]);
    expect(await ItemTagsDataListForUser(span, "user-1")).toEqual([
      "news",
      "tech",
    ]);
  });

  test("replace semantics: saving again overwrites the previous tags", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["news", "tech"]);
    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["deepwork"]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-1")).toEqual([
      "deepwork",
    ]);
  });

  test("trims, skips empties and deduplicates tags", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-1", [
      "  news  ",
      "",
      "   ",
      "news",
      "tech",
    ]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-1")).toEqual([
      "news",
      "tech",
    ]);
  });

  test("caps tags at 200 characters", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-1", [
      "a".repeat(500),
    ]);
    const tags = await ItemTagsDataGetForItem(span, "item-1", "user-1");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveLength(200);
  });

  test("normalizeTags returns an empty list for a null input", () => {
    expect(normalizeTags(null as any)).toEqual([]);
    expect(normalizeTags(undefined as any)).toEqual([]);
  });

  test("tags are per-user: another user sees none of them", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["news"]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-2")).toEqual([]);
    expect(await ItemTagsDataListForUser(span, "user-2")).toEqual([]);
  });

  test("cannot tag an item the user does not own", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await ItemTagsDataSetForItem(span, "item-1", "user-2", ["hijack"]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-2")).toEqual([]);
    expect(await ItemTagsDataGetForItem(span, "item-1", "user-1")).toEqual([]);
  });

  test("deleting an item cascades to its tags", async () => {
    await seedItem("item-1", "src-1", "user-1");
    await seedItem("item-2", "src-1", "user-1");
    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["news"]);
    await ItemTagsDataSetForItem(span, "item-2", "user-1", ["tech"]);

    await SourceItemsDataDelete(span, "user-1", "item-1");

    expect(await ItemTagsDataGetForItem(span, "item-1", "user-1")).toEqual([]);
    expect(await ItemTagsDataGetForItem(span, "item-2", "user-1")).toEqual([
      "tech",
    ]);
  });

  test("orphan cleanup removes tags of deleted items", async () => {
    await seedItem("item-1", "src-1", "user-1");
    await ItemTagsDataSetForItem(span, "item-1", "user-1", ["news"]);

    // Simulate an item deleted without the cascade (e.g. by a raw SQL path)
    await DbUtilsExecSQL(span, "DELETE FROM sources_items WHERE id = ?", [
      "item-1",
    ]);
    await SourceItemsDataCleanupOrphans(span);

    expect(await ItemTagsDataListForUser(span, "user-1")).toEqual([]);
  });
});
