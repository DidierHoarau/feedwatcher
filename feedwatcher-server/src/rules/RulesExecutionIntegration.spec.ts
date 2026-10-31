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
import { SourcesDataListCountsForUser } from "../sources/SourcesData";
import { RulesExecutionExecuteUserRules } from "./RulesExecution";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-rules-"));
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

async function seedLabeledSource(
  sourceId: string,
  userId: string,
  labelName: string,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [sourceId, userId, sourceId, "{}"],
  );
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      `${sourceId}-item`,
      sourceId,
      `${sourceId} item`,
      "content",
      `https://example.com/${sourceId}`,
      "unread",
      "2020-01-01T00:00:00.000Z",
      "",
      "{}",
    ],
  );
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_labels (id, sourceId, name, info) VALUES (?, ?, ?, ?)",
    [`${sourceId}-label`, sourceId, labelName, "{}"],
  );
}

test("a label rule refreshes counts immediately and stays inside label boundaries", async () => {
  const userId = `user-rules-${Date.now()}`;
  await seedLabeledSource("src-news", userId, "news");
  await seedLabeledSource("src-tech", userId, "news/tech");
  await seedLabeledSource("src-paper", userId, "newspaper");

  const before = await SourcesDataListCountsForUser(span, userId);
  expect(before).toHaveLength(3);
  expect(
    before.every((count: any) => Number(count.unreadCount) === 1),
  ).toBe(true);

  await RulesExecutionExecuteUserRules(span, {
    userId,
    info: [
      {
        labelName: "news",
        autoRead: [{ pattern: "*", ageDays: 1 }],
      },
    ],
  } as any);

  const after = await SourcesDataListCountsForUser(span, userId);
  const bySource = new Map(
    after.map((count: any) => [count.sourceId, count.unreadCount]),
  );
  expect(bySource.get("src-paper")).toBe(1);
  expect(bySource.has("src-news")).toBe(false);
  expect(bySource.has("src-tech")).toBe(false);

  const items = await DbUtilsQuerySQL(
    span,
    "SELECT id, status FROM sources_items ORDER BY id",
  );
  const statusById = new Map(
    items.map((item: any) => [item.id, item.status]),
  );
  expect(statusById.get("src-news-item")).toBe("read");
  expect(statusById.get("src-tech-item")).toBe("read");
  expect(statusById.get("src-paper-item")).toBe("unread");
});
