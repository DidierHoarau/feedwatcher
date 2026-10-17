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
import { SourceItemStatus } from "../model/SourceItemStatus";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import { SearchItemsDataListForSource, SearchItemsDataListForUser, SearchItemsDataListItemsForLabel } from "./SearchItemsData";

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

async function seedItem(
  sourceId: string,
  id: string,
  title: string,
  content: string,
  datePublished: Date,
  status: string = "unread"
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, sourceId, title, content, `https://x.com/${id}`, status, datePublished.toISOString(), "", "{}"]
  );
}

describe("SearchItemsData FTS search", () => {
  test("ranks a title match above a content-only match", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "in-content", "Some title", "kubernetes cluster notes", date);
    await seedItem("src-1", "in-title", "Kubernetes guide", "nothing relevant", date);

    const options = new SearchItemsOptions();
    options.pattern = "kubernetes";
    options.sort = "relevance";
    const result = await SearchItemsDataListForUser(span, "user-1", options);

    expect(result.sourceItems.map((item) => item.id)).toEqual([
      "in-title",
      "in-content",
    ]);
    expect(result.nextCursor.rank).toBeDefined();
  });

  test("prefix matching: a partial word matches longer words", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "weekly-1", "Weekly report", "content", date);

    const options = new SearchItemsOptions();
    options.pattern = "week";
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["weekly-1"]);
  });

  test("multi-token search ANDs the tokens", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "both", "Kubernetes guide", "deployment notes", date);
    await seedItem("src-1", "one", "Kubernetes guide", "something else", date);

    const options = new SearchItemsOptions();
    options.pattern = "kubernetes deployment";
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["both"]);
  });

  test("the FTS index stays in sync after item updates and deletes", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "item-1", "Initial title", "content", date);

    await DbUtilsExecSQL(span, "UPDATE sources_items SET title = 'Kubernetes ops' WHERE id = ?", ["item-1"]);
    const afterUpdate = await SearchItemsDataListForUser(span, "user-1", {
      pattern: "kubernetes",
    } as SearchItemsOptions);
    expect(afterUpdate.sourceItems.map((item) => item.id)).toEqual(["item-1"]);

    await DbUtilsExecSQL(span, "DELETE FROM sources_items WHERE id = ?", ["item-1"]);
    const afterDelete = await SearchItemsDataListForUser(span, "user-1", {
      pattern: "kubernetes",
    } as SearchItemsOptions);
    expect(afterDelete.sourceItems).toHaveLength(0);
  });

  test("rebuild reindexes the full corpus from the content table", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "item-1", "Kubernetes guide", "content", date);

    const before = await SearchItemsDataListForUser(span, "user-1", {
      pattern: "kubernetes",
    } as SearchItemsOptions);
    expect(before.sourceItems).toHaveLength(1);

    await DbUtilsExecSQL(span, "DELETE FROM items_fts");
    const emptied = await SearchItemsDataListForUser(span, "user-1", {
      pattern: "kubernetes",
    } as SearchItemsOptions);
    expect(emptied.sourceItems).toHaveLength(0);

    await DbUtilsExecSQL(span, "INSERT INTO items_fts(items_fts) VALUES ('rebuild')");
    const rebuilt = await SearchItemsDataListForUser(span, "user-1", {
      pattern: "kubernetes",
    } as SearchItemsOptions);
    expect(rebuilt.sourceItems.map((item) => item.id)).toEqual(["item-1"]);
  });

  test("paginates relevance-ordered results with the rank cursor without losing items", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 0, date, "filler");
    for (let i = 1; i <= 60; i++) {
      await seedItem(
        "src-1",
        `item-${String(i).padStart(3, "0")}`,
        `kubernetes note ${i}`,
        "kubernetes related content of varying length ".repeat(1 + (i % 5)),
        date
      );
    }

    const options = new SearchItemsOptions();
    options.pattern = "kubernetes";
    options.sort = "relevance";
    const page1 = await SearchItemsDataListForUser(span, "user-1", options);
    expect(page1.sourceItems).toHaveLength(50);
    expect(page1.pageHasMore).toBe(true);
    expect(page1.nextCursor.rank).toBeDefined();

    const page2 = await SearchItemsDataListForUser(span, "user-1", {
      ...options,
      cursor: page1.nextCursor,
    } as SearchItemsOptions);
    expect(page2.sourceItems).toHaveLength(10);
    expect(page2.pageHasMore).toBe(false);

    const allIds = [
      ...page1.sourceItems.map((item) => item.id),
      ...page2.sourceItems.map((item) => item.id),
    ];
    expect(new Set(allIds).size).toBe(60);
  });
});

describe("SearchItemsData filters", () => {
  test("filterStatus=read returns only read items", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "read-1", "Read item", "content", date, "read");
    await seedItem("src-1", "unread-1", "Unread item", "content", date, "unread");

    const options = new SearchItemsOptions();
    options.filterStatus = SourceItemStatus.read;
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["read-1"]);
  });

  test("filterStatus=all returns both read and unread items", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 1, date, "filler");
    await seedItem("src-1", "read-1", "Read item", "content", date, "read");

    const options = new SearchItemsOptions();
    options.filterStatus = SourceItemStatus.all;
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual([
      "read-1",
      "filler-001",
    ]);
  });

  test("applies the min and max date range for user listings", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 0, date, "filler");
    await seedItem("src-1", "old", "Old item", "content", new Date("2026-10-01T12:00:00.000Z"));
    await seedItem("src-1", "in-range", "In range", "content", new Date("2026-10-05T12:00:00.000Z"));
    await seedItem("src-1", "new", "New item", "content", new Date("2026-10-10T12:00:00.000Z"));

    const options = new SearchItemsOptions();
    options.minDate = new Date("2026-10-04T00:00:00.000Z");
    options.maxDate = new Date("2026-10-06T00:00:00.000Z");
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["in-range"]);
  });

  test("applies the min and max date range for source listings", async () => {
    await seedSource("src-1", "user-1", 0, new Date("2026-10-01T12:00:00.000Z"), "filler");
    await seedItem("src-1", "old", "Old item", "content", new Date("2026-10-01T12:00:00.000Z"));
    await seedItem("src-1", "in-range", "In range", "content", new Date("2026-10-05T12:00:00.000Z"));
    await seedItem("src-1", "new", "New item", "content", new Date("2026-10-10T12:00:00.000Z"));

    const options = new SearchItemsOptions();
    options.minDate = new Date("2026-10-04T00:00:00.000Z");
    options.maxDate = new Date("2026-10-06T00:00:00.000Z");
    const result = await SearchItemsDataListForSource(span, "src-1", "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["in-range"]);
  });

  test("applies the min and max date range for label listings", async () => {
    await seedSource("src-1", "user-1", 0, new Date("2026-10-01T12:00:00.000Z"), "filler");
    await seedItem("src-1", "old", "Old item", "content", new Date("2026-10-01T12:00:00.000Z"));
    await seedItem("src-1", "in-range", "In range", "content", new Date("2026-10-05T12:00:00.000Z"));
    await seedItem("src-1", "new", "New item", "content", new Date("2026-10-10T12:00:00.000Z"));
    await DbUtilsExecSQL(span, "INSERT INTO sources_labels (id, sourceId, name, info) VALUES (?, ?, ?, ?)", [
      "sl-1",
      "src-1",
      "news",
      "{}",
    ]);

    const options = new SearchItemsOptions();
    options.minDate = new Date("2026-10-04T00:00:00.000Z");
    options.maxDate = new Date("2026-10-06T00:00:00.000Z");
    const result = await SearchItemsDataListItemsForLabel(span, "news", "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["in-range"]);
  });

  test("sort=date_asc paginates oldest-first without losing items", async () => {
    const sameDate = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 60, sameDate, "item");

    const options = new SearchItemsOptions();
    options.sort = "date_asc";
    const page1 = await SearchItemsDataListForUser(span, "user-1", options);
    expect(page1.sourceItems).toHaveLength(50);
    expect(page1.sourceItems[0].id).toBe("item-001");

    const page2 = await SearchItemsDataListForUser(span, "user-1", {
      ...options,
      cursor: page1.nextCursor,
    } as SearchItemsOptions);
    expect(page2.sourceItems).toHaveLength(10);
    expect(page2.sourceItems[9].id).toBe("item-060");

    const allIds = [
      ...page1.sourceItems.map((item) => item.id),
      ...page2.sourceItems.map((item) => item.id),
    ];
    expect(new Set(allIds).size).toBe(60);
  });

  test("filters items by tag name", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 2, date, "item");
    await DbUtilsExecSQL(span, "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)", [
      "tag-1",
      "item-001",
      "user-1",
      "deepwork",
    ]);
    // A different user's tag on the same item must not leak into the filter
    await DbUtilsExecSQL(span, "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)", [
      "tag-2",
      "item-002",
      "user-2",
      "deepwork",
    ]);

    const options = new SearchItemsOptions();
    options.tagName = "deepwork";
    const result = await SearchItemsDataListForUser(span, "user-1", options);
    expect(result.sourceItems.map((item) => item.id)).toEqual(["item-001"]);
  });

  test("hydrates tags on results scoped to the requesting user", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 2, date, "item");
    await DbUtilsExecSQL(span, "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)", [
      "tag-1",
      "item-001",
      "user-1",
      "deepwork",
    ]);
    await DbUtilsExecSQL(span, "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)", [
      "tag-2",
      "item-001",
      "user-2",
      "other-user-tag",
    ]);
    await DbUtilsExecSQL(span, "INSERT INTO sources_items_tags (id, itemId, userId, name) VALUES (?, ?, ?, ?)", [
      "tag-3",
      "item-002",
      "user-1",
      "news",
    ]);

    const result = await SearchItemsDataListForUser(span, "user-1", new SearchItemsOptions());
    const tagsById = new Map(result.sourceItems.map((item) => [item.id, item.tags]));
    expect(tagsById.get("item-001")).toEqual(["deepwork"]);
    expect(tagsById.get("item-002")).toEqual(["news"]);
  });

  test("hydrates saved playback positions on results scoped to the requesting user", async () => {
    const date = new Date("2026-10-01T12:00:00.000Z");
    await seedSource("src-1", "user-1", 2, date, "item");
    await DbUtilsExecSQL(span, "INSERT INTO podcast_playback (id, itemId, userId, positionSeconds, durationSeconds, dateUpdated) VALUES (?, ?, ?, ?, ?, ?)", [
      "pb-1",
      "item-001",
      "user-1",
      615,
      3600,
      "2026-10-17T00:00:00.000Z",
    ]);
    await DbUtilsExecSQL(span, "INSERT INTO podcast_playback (id, itemId, userId, positionSeconds, durationSeconds, dateUpdated) VALUES (?, ?, ?, ?, ?, ?)", [
      "pb-2",
      "item-001",
      "user-2",
      999,
      3600,
      "2026-10-17T00:00:00.000Z",
    ]);

    const result = await SearchItemsDataListForUser(span, "user-1", new SearchItemsOptions());
    const item1 = result.sourceItems.find((item) => item.id === "item-001");
    const item2 = result.sourceItems.find((item) => item.id === "item-002");
    expect(item1.playbackPositionSeconds).toBe(615);
    expect(item1.playbackDurationSeconds).toBe(3600);
    expect(item2.playbackPositionSeconds).toBeUndefined();
    expect(item2.playbackDurationSeconds).toBeUndefined();
  });
});


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

test("returns the bookmark state of each item batched in the list result", async () => {
  const date = new Date("2026-10-01T12:00:00.000Z");
  await seedSource("src-1", "user-1", 3, date, "item");

  await DbUtilsExecSQL(
    span,
    "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)",
    ["li-1", "item-001", "user-1", "saved", "{}"],
  );
  // A different user's bookmark on the same item must not leak in
  await DbUtilsExecSQL(
    span,
    "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)",
    ["li-2", "item-002", "user-2", "saved", "{}"],
  );

  const result = await SearchItemsDataListForUser(
    span,
    "user-1",
    new SearchItemsOptions()
  );
  const savedById = new Map(
    result.sourceItems.map((item) => [item.id, item.isSaved])
  );
  expect(savedById.get("item-001")).toBe(true);
  expect(savedById.get("item-002")).toBe(false);
  expect(savedById.get("item-003")).toBe(false);
});

test("returns the bookmark state for source and label listings too", async () => {
  const date = new Date("2026-10-01T12:00:00.000Z");
  await seedSource("src-1", "user-1", 2, date, "item");
  await DbUtilsExecSQL(
    span,
    "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)",
    ["li-1", "item-002", "user-1", "saved", "{}"],
  );
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_labels (id, sourceId, name, info) VALUES (?, ?, ?, ?)",
    ["sl-1", "src-1", "news", "{}"]
  );

  const forSource = await SearchItemsDataListForSource(
    span,
    "src-1",
    "user-1",
    new SearchItemsOptions()
  );
  expect(forSource.sourceItems.map((item) => item.isSaved)).toEqual([
    true,
    false,
  ]);

  const forLabel = await SearchItemsDataListItemsForLabel(
    span,
    "news",
    "user-1",
    new SearchItemsOptions()
  );
  expect(forLabel.sourceItems.map((item) => item.isSaved)).toEqual([
    true,
    false,
  ]);
});
