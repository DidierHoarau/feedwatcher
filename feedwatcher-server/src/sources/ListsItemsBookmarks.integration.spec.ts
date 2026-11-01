import Fastify, { FastifyInstance } from "fastify";
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
import { ListItem } from "../model/ListItem";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import { ListsItemsDataAdd } from "./ListsItemsData";
import { ListsItemsRoutes } from "./ListsItemsRoutes";
import { SourcesDataResetCountsForTests } from "./SourcesData";
import { AuthGetUserSession } from "../users/Auth";

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(() => {
  span = OTelTracer().startSpan("test");
  SourcesDataResetCountsForTests();
});

afterEach(() => {
  closeDb();
  SourcesDataResetCountsForTests();
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

function closeDb(): void {
  const db = DbUtilsGetDatabase();
  if (db && typeof db.close === "function") {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
}

function copyMigrations(sqlDir: string, upToVersion: number): void {
  fs.ensureDirSync(sqlDir);
  for (const file of fs.readdirSync(SQL_DIR)) {
    const match = /^init-(\d+)\.sql$/.exec(file);
    if (match && Number(match[1]) <= upToVersion) {
      fs.copyFileSync(path.join(SQL_DIR, file), path.join(sqlDir, file));
    }
  }
}

async function initDb(sqlDir: string, dataDir: string): Promise<void> {
  const config = new Config();
  config.DATA_DIR = dataDir;
  config.DATABASE_TYPE = "sqlite";
  await DbUtilsInit(span, config, sqlDir);
}

async function initTempDb(upToVersion: number): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-bookmarks-"));
  tempDirs.push(dir);
  copyMigrations(path.join(dir, "sql"), upToVersion);
  await initDb(path.join(dir, "sql"), path.join(dir, "data"));
  return dir;
}

async function insertSource(id: string, userId: string): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [id, userId, id, "{}"],
  );
}

async function insertItem(id: string, sourceId: string): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      sourceId,
      id,
      "content",
      `https://example.com/${id}`,
      "unread",
      "2026-01-01T00:00:00.000Z",
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
    "INSERT INTO lists_items (id, itemId, userId, name, info) VALUES (?, ?, ?, ?, ?)",
    [id, itemId, userId, "_default", "{}"],
  );
}

describe("init-0015 bookmark dedupe migration", () => {
  test("dedupes existing rows and rejects later duplicates", async () => {
    const dir = await initTempDb(14);
    await insertListItem("li-a", "item-1", "user-1");
    await insertListItem("li-b", "item-1", "user-1");
    await insertListItem("li-c", "item-1", "user-2");
    await insertListItem("li-d", "item-2", "user-1");

    closeDb();
    fs.copyFileSync(
      path.join(SQL_DIR, "init-0015.sql"),
      path.join(dir, "sql", "init-0015.sql"),
    );
    await initDb(path.join(dir, "sql"), path.join(dir, "data"));

    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT id, itemId, userId FROM lists_items ORDER BY itemId, userId",
    );
    expect(rows).toEqual([
      { id: "li-a", itemId: "item-1", userId: "user-1" },
      { id: "li-c", itemId: "item-1", userId: "user-2" },
      { id: "li-d", itemId: "item-2", userId: "user-1" },
    ]);

    const versions = await DbUtilsQuerySQL(
      span,
      "SELECT MAX(CAST(value AS INTEGER)) AS maxVersion FROM metadata WHERE type = 'db_version'",
    );
    expect(Number(versions[0].maxVersion)).toBe(15);

    await expect(
      insertListItem("li-e", "item-1", "user-1"),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe("ListsItemsDataAdd idempotency", () => {
  test("adding the same bookmark twice leaves a single row", async () => {
    await initTempDb(15);

    const first = new ListItem();
    first.itemId = "item-1";
    first.userId = "user-1";
    const second = new ListItem();
    second.itemId = "item-1";
    second.userId = "user-1";

    await ListsItemsDataAdd(span, first);
    await ListsItemsDataAdd(span, second);

    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM lists_items WHERE itemId = ? AND userId = ?",
      ["item-1", "user-1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
  });
});

describe("ListsItemsRoutes repeated bookmark requests", () => {
  test("PUT /items is idempotent and ignores the legacy listName field", async () => {
    await initTempDb(15);
    await insertSource("src-1", "user-1");
    await insertItem("item-1", "src-1");
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });

    const fastify: FastifyInstance = Fastify();
    await new ListsItemsRoutes().getRoutes(fastify);

    const first = await fastify.inject({
      method: "PUT",
      url: "/items",
      payload: { itemId: "item-1" },
    });
    const second = await fastify.inject({
      method: "PUT",
      url: "/items",
      payload: { itemId: "item-1", listName: "legacy" },
    });
    await fastify.close();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT id FROM lists_items WHERE itemId = ? AND userId = ?",
      ["item-1", "user-1"],
    );
    expect(rows).toHaveLength(1);
  });
});
