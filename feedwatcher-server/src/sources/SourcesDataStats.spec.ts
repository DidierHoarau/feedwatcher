import { Span } from "@opentelemetry/sdk-trace";
import {
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
} from "@devopsplaybook.io/common-utils";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Config } from "../Config";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import {
  SourcesDataGetGlobalItemCounts,
  SourcesDataInvalidateUserCache,
  SourcesDataResetCountsForTests,
  SourcesDataWarmItemCounts,
} from "./SourcesData";
import { SourceItemsDataCleanupOrphans } from "./SourceItemsData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-counts-"));
  tempDirs.push(dir);
  const config = new Config();
  config.DATA_DIR = dir;
  config.DATABASE_TYPE = "sqlite";
  span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);
  SourcesDataResetCountsForTests();
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
  SourcesDataResetCountsForTests();
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

async function insertSource(id: string, userId: string): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [id, userId, id, "{}"],
  );
}

async function insertItem(
  id: string,
  sourceId: string,
  status: "read" | "unread",
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      sourceId,
      id,
      "content",
      `https://example.com/${id}`,
      status,
      "2026-01-01T00:00:00.000Z",
      "",
      "{}",
    ],
  );
}

async function insertListItem(
  id: string,
  itemId: string,
  userId: string,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO lists_items (id,itemId,userId,name,info) VALUES (?,?,?,?,?)",
    [id, itemId, userId, "saved", "{}"],
  );
}

describe("SourcesDataWarmItemCounts", () => {
  test("sums read/unread and counts an item saved by two users once", async () => {
    await insertSource("src-1", "user-1");
    await insertSource("src-2", "user-2");
    await insertItem("item-1", "src-1", "unread");
    await insertItem("item-2", "src-1", "read");
    await insertItem("item-3", "src-2", "unread");
    await insertItem("item-4", "src-2", "unread");
    await insertListItem("li-1", "item-1", "list-owner-a");
    await insertListItem("li-2", "item-1", "list-owner-b");

    await SourcesDataWarmItemCounts(span);

    expect(SourcesDataGetGlobalItemCounts()).toEqual({
      read: 1,
      unread: 3,
      total: 4,
      bookmarked: 1,
    });
  });

  test("does not count items whose source no longer exists", async () => {
    await insertSource("src-1", "user-1");
    await insertItem("item-1", "src-1", "unread");
    await insertItem("item-orphan", "src-gone", "unread");

    await SourcesDataWarmItemCounts(span);

    expect(SourcesDataGetGlobalItemCounts()).toEqual({
      read: 0,
      unread: 1,
      total: 1,
      bookmarked: 0,
    });
  });
});

describe("SourcesDataInvalidateUserCache counts", () => {
  test("refreshes the in-memory totals immediately on the first invalidation", async () => {
    await insertSource("src-1", "user-1");
    await insertSource("src-2", "user-2");
    await insertItem("item-1", "src-1", "unread");
    await insertItem("item-2", "src-1", "unread");
    await insertItem("item-3", "src-2", "read");
    await SourcesDataWarmItemCounts(span);

    await DbUtilsExecSQL(span, "UPDATE sources_items SET status = 'read' WHERE id = ?", [
      "item-1",
    ]);
    await insertListItem("li-1", "item-2", "list-owner");
    await SourcesDataInvalidateUserCache(span, "user-1");

    expect(SourcesDataGetGlobalItemCounts()).toEqual({
      read: 2,
      unread: 1,
      total: 3,
      bookmarked: 1,
    });
  });
});

describe("orphan cleanup reconciliation", () => {
  test("removes orphan items and leaves the totals consistent", async () => {
    await insertSource("src-1", "user-1");
    await insertItem("item-1", "src-1", "unread");
    await insertItem("item-orphan", "src-gone", "unread");
    await SourcesDataWarmItemCounts(span);
    expect(SourcesDataGetGlobalItemCounts().total).toBe(1);

    await SourceItemsDataCleanupOrphans(span);

    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM sources_items ORDER BY id",
    );
    expect(rows.map((row: any) => row.id)).toEqual(["item-1"]);
    // The cleanup runs the reconciliation: the stale items are gone and the
    // remaining counts stay consistent without another cycle-level query.
    expect(SourcesDataGetGlobalItemCounts()).toEqual({
      read: 0,
      unread: 1,
      total: 1,
      bookmarked: 0,
    });
  });
});
