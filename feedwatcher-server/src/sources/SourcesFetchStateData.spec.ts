import { Span } from "@opentelemetry/sdk-trace-base";
import {
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
  SourcesFetchStateDataDelete,
  SourcesFetchStateDataGet,
  SourcesFetchStateDataSave,
} from "./SourcesFetchStateData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-fetch-state-"));
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

describe("SourcesFetchStateData", () => {
  test("returns null when no state is stored", async () => {
    expect(await SourcesFetchStateDataGet(span, "src-1")).toBeNull();
  });

  test("saves and reads back the validators", async () => {
    await SourcesFetchStateDataSave(span, "src-1", {
      url: "https://example.com/feed",
      etag: '"v1"',
      lastModified: "Wed, 01 Oct 2025 12:00:00 GMT",
    });

    expect(await SourcesFetchStateDataGet(span, "src-1")).toEqual({
      url: "https://example.com/feed",
      etag: '"v1"',
      lastModified: "Wed, 01 Oct 2025 12:00:00 GMT",
    });
  });

  test("upserts the state of an existing source", async () => {
    await SourcesFetchStateDataSave(span, "src-1", {
      url: "https://example.com/feed",
      etag: '"v1"',
      lastModified: null,
    });
    await SourcesFetchStateDataSave(span, "src-1", {
      url: "https://example.com/feed-v2",
      etag: null,
      lastModified: "date-2",
    });

    expect(await SourcesFetchStateDataGet(span, "src-1")).toEqual({
      url: "https://example.com/feed-v2",
      etag: null,
      lastModified: "date-2",
    });
  });

  test("deletes the state of a source", async () => {
    await SourcesFetchStateDataSave(span, "src-1", {
      url: "https://example.com/feed",
      etag: '"v1"',
      lastModified: null,
    });
    await SourcesFetchStateDataDelete(span, "src-1");

    expect(await SourcesFetchStateDataGet(span, "src-1")).toBeNull();
  });
});
