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
  SourcesExportDataItemsForUser,
  SourcesExportDataListForUser,
} from "./SourcesExportData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-export-"));
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

async function insertSource(
  id: string,
  userId: string,
  info: any = {},
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [id, userId, `Source ${id}`, JSON.stringify(info)],
  );
}

async function insertLabel(
  sourceId: string,
  name: string,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_labels (id, sourceId, name, info) VALUES (?, ?, ?, ?)",
    [`label-${sourceId}-${name}`, sourceId, name, "{}"],
  );
}

async function insertItem(
  id: string,
  sourceId: string,
  info: any = {},
  thumbnail: string | null = null,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources_items " +
      "(id, sourceId, title, content, url, status, datePublished, thumbnail, info) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      sourceId,
      `Title ${id}`,
      `Content ${id}`,
      `https://example.com/${id}`,
      "unread",
      "2026-01-01T00:00:00.000Z",
      thumbnail,
      JSON.stringify(info),
    ],
  );
}

describe("SourcesExportData", () => {
  test("exports only the caller's sources with parsed info and sorted labels", async () => {
    await insertSource("source-2", "user-1", {
      url: "https://b.example/feed.xml",
      processorPath: "custom.js",
    });
    await insertSource("source-1", "user-1", {
      url: "https://a.example/feed.xml",
    });
    await insertSource("source-3", "user-2", {
      url: "https://c.example/feed.xml",
    });
    await insertLabel("source-1", "News");
    await insertLabel("source-1", "Tech");
    await insertLabel("source-3", "Other");

    const sources = await SourcesExportDataListForUser(span, "user-1");

    expect(sources).toEqual([
      {
        id: "source-1",
        name: "Source source-1",
        info: { url: "https://a.example/feed.xml" },
        labels: ["News", "Tech"],
      },
      {
        id: "source-2",
        name: "Source source-2",
        info: {
          url: "https://b.example/feed.xml",
          processorPath: "custom.js",
        },
        labels: [],
      },
    ]);
  });

  test("paginates items by id and never returns another user's items", async () => {
    await insertSource("source-1", "user-1");
    await insertSource("source-2", "user-1");
    await insertSource("source-3", "user-2");
    await insertItem("item-2", "source-2", { author: "B" }, "thumb.png");
    await insertItem("item-1", "source-1", { author: "A" });
    await insertItem("item-3", "source-1");
    await insertItem("item-9", "source-3", { author: "Other" });

    const firstPage = await SourcesExportDataItemsForUser(
      span,
      "user-1",
      "",
      2,
    );
    const secondPage = await SourcesExportDataItemsForUser(
      span,
      "user-1",
      firstPage[firstPage.length - 1].id,
      2,
    );

    expect(firstPage.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(firstPage[0].info).toEqual({ author: "A" });
    expect(firstPage[0].thumbnail).toBeNull();
    expect(firstPage[1].thumbnail).toBe("thumb.png");
    expect(secondPage.map((item) => item.id)).toEqual(["item-3"]);
    expect(secondPage[0].info).toEqual({});
  });
});
