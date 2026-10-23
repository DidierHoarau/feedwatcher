import { Span } from "@opentelemetry/sdk-trace-base";
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
import { SourceItem } from "../model/SourceItem";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import {
  SourceItemsDataAddMany,
  SourceItemsDataCleanupOrphans,
} from "./SourceItemsData";
import { SourcesDataInvalidateUserCache } from "./SourcesData";

jest.mock("./SourcesData", () => {
  const actual = jest.requireActual("./SourcesData");
  return {
    ...actual,
    SourcesDataInvalidateUserCache: jest.fn(),
  };
});

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-items-"));
  tempDirs.push(dir);
  const config = new Config();
  config.DATA_DIR = dir;
  config.DATABASE_TYPE = "sqlite";
  span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    ["src-1", "user-1", "Test Source", JSON.stringify({})],
  );
  jest.clearAllMocks();
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

function newItem(id: string, url: string): SourceItem {
  const item = new SourceItem();
  item.id = id;
  item.sourceId = "src-1";
  item.title = id;
  item.content = "content";
  item.url = url;
  item.thumbnail = null;
  item.status = "unread" as any;
  item.datePublished = new Date("2026-01-01T00:00:00Z");
  item.info = {};
  return item;
}

async function countItems(): Promise<number> {
  const rows = await DbUtilsQuerySQL(
    span,
    "SELECT COUNT(*) as count FROM sources_items",
  );
  return rows[0].count;
}

async function insertItem(id: string, sourceId: string): Promise<void> {
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
      "unread",
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

describe("SourceItemsDataCleanupOrphans", () => {
  test("deletes saved-list rows whose item no longer exists", async () => {
    await insertItem("item-1", "src-1");
    await insertListItem("li-1", "item-1", "user-1");
    await insertListItem("li-orphan", "item-gone", "user-1");

    await SourceItemsDataCleanupOrphans(span);

    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM lists_items ORDER BY id",
    );
    expect(rows.map((row: any) => row.id)).toEqual(["li-1"]);
  });

  test("cleans saved-list rows of items removed with their source in one pass", async () => {
    await DbUtilsExecSQL(
      span,
      "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
      ["src-2", "user-1", "Gone Source", "{}"],
    );
    await insertItem("item-2", "src-2");
    await insertListItem("li-2", "item-2", "user-1");
    await insertItem("item-1", "src-1");
    await insertListItem("li-1", "item-1", "user-1");

    await DbUtilsExecSQL(span, "DELETE FROM sources WHERE id = ?", ["src-2"]);

    await SourceItemsDataCleanupOrphans(span);

    const items = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM sources_items ORDER BY id",
    );
    expect(items.map((row: any) => row.id)).toEqual(["item-1"]);
    const listRows = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM lists_items ORDER BY id",
    );
    expect(listRows.map((row: any) => row.id)).toEqual(["li-1"]);
  });
});

describe("SourceItemsDataAddMany", () => {
  test("inserts a whole batch and invalidates the user cache once", async () => {
    const items = [];
    for (let i = 0; i < 50; i++) {
      items.push(newItem(`item-${i}`, `https://example.com/${i}`));
    }

    await SourceItemsDataAddMany(span, "src-1", "user-1", items);

    expect(await countItems()).toBe(50);
    expect(SourcesDataInvalidateUserCache).toHaveBeenCalledTimes(1);
    expect(jest.mocked(SourcesDataInvalidateUserCache)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
  });

  test("skips duplicates inside one batch and against existing rows", async () => {
    await SourceItemsDataAddMany(span, "src-1", "user-1", [
      newItem("item-1", "https://example.com/a"),
    ]);

    await SourceItemsDataAddMany(span, "src-1", "user-1", [
      newItem("item-2", "https://example.com/a"),
      newItem("item-3", "https://example.com/b"),
      newItem("item-4", "https://example.com/b"),
      newItem("item-5", "https://example.com/c"),
    ]);

    const rows = await DbUtilsQuerySQL(span, "SELECT id, url FROM sources_items ORDER BY id");
    expect(rows.map((row) => row.id)).toEqual(["item-1", "item-3", "item-5"]);
  });

  test("inserts items without a URL without the dedupe guard", async () => {
    await SourceItemsDataAddMany(span, "src-1", "user-1", [
      newItem("item-1", ""),
      newItem("item-2", ""),
    ]);

    expect(await countItems()).toBe(2);
  });

  test("does nothing for an empty batch", async () => {
    await SourceItemsDataAddMany(span, "src-1", "user-1", []);

    expect(await countItems()).toBe(0);
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
  });

  test("rolls the whole batch back when one item is invalid", async () => {
    const badItem = newItem("item-bad", "https://example.com/bad");
    badItem.datePublished = new Date("not a date");

    await expect(
      SourceItemsDataAddMany(span, "src-1", "user-1", [
        newItem("item-1", "https://example.com/a"),
        badItem,
        newItem("item-3", "https://example.com/c"),
      ]),
    ).rejects.toThrow();

    expect(await countItems()).toBe(0);
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
  });
});
