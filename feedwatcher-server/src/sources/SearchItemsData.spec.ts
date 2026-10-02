import { Span } from "@opentelemetry/sdk-trace-base";
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
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import { SearchItemsDataListForUser } from "./SearchItemsData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-search-"));
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

async function seedSource(
  sourceId: string,
  userId: string,
  itemCount: number,
  datePublished: Date,
  idPrefix: string
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [sourceId, userId, "Test Source", JSON.stringify({ url: "https://x.com" })]
  );
  for (let i = 1; i <= itemCount; i++) {
    await DbUtilsExecSQL(
      span,
      "INSERT INTO sources_items " +
        "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        `${idPrefix}-${String(i).padStart(3, "0")}`,
        sourceId,
        `Item ${i}`,
        "content",
        `https://x.com/${idPrefix}/${i}`,
        "unread",
        datePublished.toISOString(),
        "",
        "{}",
      ]
    );
  }
}

test("paginates items sharing identical timestamps without losing any", async () => {
  const sameDate = new Date("2026-10-01T12:00:00.000Z");
  await seedSource("src-1", "user-1", 60, sameDate, "item");

  const page1 = await SearchItemsDataListForUser(
    span,
    "user-1",
    new SearchItemsOptions()
  );
  expect(page1.sourceItems).toHaveLength(50);
  expect(page1.pageHasMore).toBe(true);
  expect(page1.nextCursor).toEqual({
    datePublished: sameDate.toISOString(),
    id: "item-011",
  });

  const page2 = await SearchItemsDataListForUser(span, "user-1", {
    cursor: page1.nextCursor,
  } as SearchItemsOptions);
  expect(page2.sourceItems).toHaveLength(10);
  expect(page2.pageHasMore).toBe(false);
  expect(page2.nextCursor).toEqual({
    datePublished: sameDate.toISOString(),
    id: "item-001",
  });

  const allIds = [
    ...page1.sourceItems.map((item) => item.id),
    ...page2.sourceItems.map((item) => item.id),
  ];
  expect(new Set(allIds).size).toBe(60);
  expect(allIds).toContain("item-001");
  expect(allIds).toContain("item-060");
});

test("always bounds the page size (no unbounded page=-1 path)", async () => {
  const sameDate = new Date("2026-10-01T12:00:00.000Z");
  await seedSource("src-1", "user-1", 120, sameDate, "item");

  const page1 = await SearchItemsDataListForUser(
    span,
    "user-1",
    new SearchItemsOptions()
  );
  expect(page1.sourceItems).toHaveLength(50);
  expect(page1.pageHasMore).toBe(true);
});

test("orders by date then id and never crosses the user boundary", async () => {
  await seedSource(
    "src-1",
    "user-1",
    5,
    new Date("2026-10-01T12:00:00.000Z"),
    "mine"
  );
  await seedSource(
    "src-2",
    "user-2",
    3,
    new Date("2026-10-02T12:00:00.000Z"),
    "other"
  );

  const result = await SearchItemsDataListForUser(
    span,
    "user-1",
    new SearchItemsOptions()
  );
  expect(result.sourceItems).toHaveLength(5);
  expect(result.sourceItems.map((item) => item.id)).toEqual([
    "mine-005",
    "mine-004",
    "mine-003",
    "mine-002",
    "mine-001",
  ]);
  expect(result.pageHasMore).toBe(false);
});

test("expired cursor id is excluded and older items remain reachable", async () => {
  const sameDate = new Date("2026-10-01T12:00:00.000Z");
  await seedSource("src-1", "user-1", 10, sameDate, "item");

  const result = await SearchItemsDataListForUser(span, "user-1", {
    cursor: { datePublished: sameDate.toISOString(), id: "item-005" },
  } as SearchItemsOptions);
  expect(result.sourceItems.map((item) => item.id)).toEqual([
    "item-004",
    "item-003",
    "item-002",
    "item-001",
  ]);
});
