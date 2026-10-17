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
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import {
  PodcastPlaybackDataGetForItem,
  PodcastPlaybackDataListForItems,
  PodcastPlaybackDataSetForItem,
} from "./PodcastPlaybackData";
import { SourceItemsDataCleanupOrphans } from "./SourceItemsData";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];
let span: Span;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-podcast-"));
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

describe("PodcastPlaybackData", () => {
  test("set then get returns the saved position and duration", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 615, 3600);
    const playback = await PodcastPlaybackDataGetForItem(
      span,
      "item-1",
      "user-1",
    );
    expect(playback).not.toBeNull();
    expect(playback!.positionSeconds).toBe(615);
    expect(playback!.durationSeconds).toBe(3600);
    expect(playback!.dateUpdated).toBeTruthy();
  });

  test("setting again updates the same row (upsert)", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 60, 3600);
    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 120, 3600);

    const rows = await DbUtilsQuerySQL(
      span,
      "SELECT COUNT(*) as count FROM podcast_playback WHERE itemId = ? AND userId = ?",
      ["item-1", "user-1"],
    );
    expect(rows[0].count).toBe(1);
    const playback = await PodcastPlaybackDataGetForItem(
      span,
      "item-1",
      "user-1",
    );
    expect(playback!.positionSeconds).toBe(120);
  });

  test("get for an item without saved playback returns null", async () => {
    await seedItem("item-1", "src-1", "user-1");

    expect(
      await PodcastPlaybackDataGetForItem(span, "item-1", "user-1"),
    ).toBeNull();
    expect(
      await PodcastPlaybackDataGetForItem(span, "unknown-item", "user-1"),
    ).toBeNull();
  });

  test("playback is per-user: another user sees no position", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 60, 3600);
    expect(
      await PodcastPlaybackDataGetForItem(span, "item-1", "user-2"),
    ).toBeNull();
  });

  test("cannot save a position for an item the user does not own", async () => {
    await seedItem("item-1", "src-1", "user-1");

    await PodcastPlaybackDataSetForItem(span, "item-1", "user-2", 60, 3600);
    expect(
      await PodcastPlaybackDataGetForItem(span, "item-1", "user-2"),
    ).toBeNull();
    expect(
      await PodcastPlaybackDataGetForItem(span, "item-1", "user-1"),
    ).toBeNull();
  });

  test("list for items returns positions for the requested page only", async () => {
    await seedItem("item-1", "src-1", "user-1");
    await seedItem("item-2", "src-1", "user-1");
    await seedItem("item-3", "src-1", "user-1");

    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 30, 3600);
    await PodcastPlaybackDataSetForItem(span, "item-3", "user-1", 90, 3600);

    const playback = await PodcastPlaybackDataListForItems(span, "user-1", [
      "item-1",
      "item-2",
      "item-3",
    ]);
    expect(playback.size).toBe(2);
    expect(playback.get("item-1")).toEqual({
      positionSeconds: 30,
      durationSeconds: 3600,
    });
    expect(playback.get("item-3")).toEqual({
      positionSeconds: 90,
      durationSeconds: 3600,
    });
    expect(playback.has("item-2")).toBe(false);
  });

  test("list for items returns an empty map for an empty page", async () => {
    const playback = await PodcastPlaybackDataListForItems(span, "user-1", []);
    expect(playback.size).toBe(0);
  });

  test("orphan cleanup removes playback rows of deleted items", async () => {
    await seedItem("item-1", "src-1", "user-1");
    await seedItem("item-2", "src-1", "user-1");
    await PodcastPlaybackDataSetForItem(span, "item-1", "user-1", 30, 3600);
    await PodcastPlaybackDataSetForItem(span, "item-2", "user-1", 90, 3600);

    // Simulate an item deleted without the cascade (e.g. by a raw SQL path)
    await DbUtilsExecSQL(span, "DELETE FROM sources_items WHERE id = ?", [
      "item-1",
    ]);
    await SourceItemsDataCleanupOrphans(span);

    expect(
      await PodcastPlaybackDataGetForItem(span, "item-1", "user-1"),
    ).toBeNull();
    expect(
      await PodcastPlaybackDataGetForItem(span, "item-2", "user-1"),
    ).not.toBeNull();
  });
});
