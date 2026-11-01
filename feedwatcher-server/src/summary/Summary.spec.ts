import axios from "axios";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Config } from "../Config";
import { UsersDataList } from "../users/UsersData";
import {
  SummaryGenerate,
  SummaryGetCached,
  SummaryInit,
  SUMMARY_MAX_PROMPT_ITEMS,
} from "./Summary";
import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import * as schedule from "node-schedule";

jest.mock("../OTelContext", () => ({
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  OTelTracer: () => ({
    startSpan: () => ({ end: jest.fn() }),
  }),
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("../users/UsersData", () => ({
  UsersDataList: jest.fn(),
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  ...jest.requireActual("@devopsplaybook.io/common-utils"),
  DbUtilsQuerySQL: jest.fn(),
}));

jest.mock("node-schedule", () => ({
  scheduleJob: jest.fn(() => ({ cancel: jest.fn() })),
}));

jest.mock("../notifications/Notifications", () => ({
  NotificationsSendDigestForUser: jest.fn(),
}));

import { NotificationsSendDigestForUser } from "../notifications/Notifications";

jest.mock("sanitize-html", () => ({
  __esModule: true,
  default: (html: string) => html,
}));

jest.mock("fs-extra", () => {
  const actual = jest.requireActual("fs-extra");
  return {
    ...actual,
    writeJson: jest.fn(actual.writeJson),
    rename: jest.fn(actual.rename),
  };
});

function newConfig(dataDir: string, llmKey: string): Config {
  const config = new Config();
  config.DATA_DIR = dataDir;
  config.LLM_API_KEY = llmKey;
  return config;
}

function newTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-summary-"));
}

function rawItem(index: number): any {
  return {
    id: `item-${index}`,
    sourceId: "src-1",
    sourceName: "Source One",
    title: `Title ${index}`,
    content: `Content ${index}`,
    url: `https://example.com/${index}`,
    status: "unread",
    datePublished: new Date("2026-10-01T12:00:00.000Z").toISOString(),
    thumbnail: null,
    info: "{}",
  };
}

let tempDirs: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

test("does not generate anything when LLM_API_KEY is absent (M11)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "");

  await SummaryInit({} as any, config);

  expect(UsersDataList).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
  expect(fs.pathExistsSync(path.join(dir, "summary.json"))).toBe(false);
  expect(schedule.scheduleJob).not.toHaveBeenCalled();
});

test("schedules generation when a key is configured (M11)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  fs.writeJsonSync(path.join(dir, "summary.json"), {});

  await SummaryInit({} as any, config);

  expect(schedule.scheduleJob).toHaveBeenCalled();
});

test("caps the prompt to the most recent items (M11)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  const rawItems = [];
  for (let i = 0; i < SUMMARY_MAX_PROMPT_ITEMS + 50; i++) {
    rawItems.push(rawItem(i));
  }
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue(rawItems);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);

  await SummaryGenerate(config);

  expect(axios.post).toHaveBeenCalledTimes(1);
  const payload = jest.mocked(axios.post).mock.calls[0][1] as any;
  const userContent = payload.messages[1].content;
  const includedLines = userContent
    .split("\n")
    .filter((line: string) => line.startsWith("- ["));
  expect(includedLines.length).toBe(SUMMARY_MAX_PROMPT_ITEMS);
  expect(userContent).toContain("Title 0");
  expect(userContent).not.toContain(`Title ${SUMMARY_MAX_PROMPT_ITEMS + 10}`);
});

test("applies a timeout and the configured key to the LLM call (M11)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);

  await SummaryGenerate(config);

  const options = jest.mocked(axios.post).mock.calls[0][2] as any;
  expect(options.timeout).toBe(60000);
  expect(options.headers.Authorization).toBe("Bearer test-key");
});

test("writes atomically via a temp file and rename (M11)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);
  const finalPath = path.join(dir, "summary.json");
  fs.writeJsonSync(finalPath, {});
  await SummaryInit({} as any, config);

  await SummaryGenerate(config);

  const tmpPath = `${finalPath}.tmp`;
  expect(jest.mocked(fs.writeJson)).toHaveBeenCalledWith(
    tmpPath,
    expect.anything()
  );
  expect(jest.mocked(fs.rename)).toHaveBeenCalledWith(tmpPath, finalPath);
  expect(fs.pathExistsSync(tmpPath)).toBe(false);
  const saved = fs.readJsonSync(finalPath);
  expect(saved["user-1"].summary).toBe("## Summary");
  expect(saved["user-1"].status).toBe("ok");
  expect(saved["user-1"].error).toBeNull();
});

test("uses a custom summary prompt as the system message (N1)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([
    { id: "user-1", settings: { notifications: { digest: false, newItems: "off", newItemsLabels: [] }, summaryPrompt: "You are a pirate. Summarize in haikus." } },
  ] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);

  await SummaryGenerate(config);

  const payload = jest.mocked(axios.post).mock.calls[0][1] as any;
  expect(payload.messages[0].content).toBe(
    "You are a pirate. Summarize in haikus."
  );
});

test("falls back to the default system prompt when no custom prompt is set (N1)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);

  await SummaryGenerate(config);

  const payload = jest.mocked(axios.post).mock.calls[0][1] as any;
  expect(payload.messages[0].content).not.toBe("");
  expect(payload.messages[0].content).toContain("You summarize news feeds");
});

test("sends a digest push for each user with a non-empty summary (N1)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);

  await SummaryGenerate(config);

  expect(NotificationsSendDigestForUser).toHaveBeenCalledTimes(1);
  expect(jest.mocked(NotificationsSendDigestForUser).mock.calls[0][1]).toBe(
    "user-1"
  );
  expect(jest.mocked(NotificationsSendDigestForUser).mock.calls[0][2]).toBe(
    "## Summary"
  );
});

test("does not send a digest push when the summary is empty (N1)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);

  await SummaryGenerate(config);

  expect(NotificationsSendDigestForUser).not.toHaveBeenCalled();
});

test("keeps generating summaries when the digest push fails (N1)", async () => {
  const dir = newTempDir();
  tempDirs.push(dir);
  const config = newConfig(dir, "test-key");
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
  jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
  jest.mocked(axios.post).mockResolvedValue({
    data: { choices: [{ message: { content: "## Summary" } }] },
  } as any);
  jest
    .mocked(NotificationsSendDigestForUser)
    .mockRejectedValue(new Error("push subsystem down"));
  const finalPath = path.join(dir, "summary.json");
  fs.writeJsonSync(finalPath, {});
  await SummaryInit({} as any, config);

  await expect(SummaryGenerate(config)).resolves.toBeUndefined();
  const saved = fs.readJsonSync(finalPath);
  expect(saved["user-1"].summary).toBe("## Summary");
});

describe("summary failure handling (M3)", () => {
  const PREVIOUS_GENERATED_AT = "2026-10-31T08:00:00.000Z";

  function setupPreviousGeneration() {
    const dir = newTempDir();
    tempDirs.push(dir);
    const config = newConfig(dir, "test-key");
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([rawItem(1)]);
    jest.mocked(UsersDataList).mockResolvedValue([{ id: "user-1" }] as any);
    return { dir, config, finalPath: path.join(dir, "summary.json") };
  }

  test("keeps the previous summary and marks it stale on LLM failure", async () => {
    const { config, finalPath } = setupPreviousGeneration();
    fs.writeJsonSync(finalPath, {
      "user-1": {
        itemCount: 2,
        summary: "## Old Summary",
        generatedAt: PREVIOUS_GENERATED_AT,
      },
    });
    await SummaryInit({} as any, config);
    jest.mocked(axios.post).mockRejectedValue(new Error("LLM down"));

    await SummaryGenerate(config);

    const saved = fs.readJsonSync(finalPath)["user-1"];
    expect(saved.summary).toBe("## Old Summary");
    expect(saved.generatedAt).toBe(PREVIOUS_GENERATED_AT);
    expect(saved.itemCount).toBe(2);
    expect(saved.status).toBe("error");
    expect(saved.error).toContain("LLM down");
    expect(saved.errorAt).toBeTruthy();
    expect(NotificationsSendDigestForUser).not.toHaveBeenCalled();
  });

  test("treats an empty LLM answer as a failure and keeps the previous summary", async () => {
    const { config, finalPath } = setupPreviousGeneration();
    fs.writeJsonSync(finalPath, {
      "user-1": {
        itemCount: 2,
        summary: "## Old Summary",
        generatedAt: PREVIOUS_GENERATED_AT,
      },
    });
    await SummaryInit({} as any, config);
    jest.mocked(axios.post).mockResolvedValue({
      data: { choices: [{ message: { content: "   " } }] },
    } as any);

    await SummaryGenerate(config);

    const saved = fs.readJsonSync(finalPath)["user-1"];
    expect(saved.summary).toBe("## Old Summary");
    expect(saved.generatedAt).toBe(PREVIOUS_GENERATED_AT);
    expect(saved.status).toBe("error");
    expect(saved.error).toBe("LLM returned an empty summary");
    expect(NotificationsSendDigestForUser).not.toHaveBeenCalled();
  });

  test("writes an empty error entry when there is no previous summary", async () => {
    const { config, finalPath } = setupPreviousGeneration();
    fs.writeJsonSync(finalPath, {});
    await SummaryInit({} as any, config);
    jest.mocked(axios.post).mockRejectedValue(new Error("LLM down"));

    await SummaryGenerate(config);

    const saved = fs.readJsonSync(finalPath)["user-1"];
    expect(saved.summary).toBe("");
    expect(saved.itemCount).toBe(0);
    expect(saved.status).toBe("error");
    expect(saved.error).toContain("LLM down");
    expect(NotificationsSendDigestForUser).not.toHaveBeenCalled();
  });

  test("SummaryGetCached exposes the stale status and error", async () => {
    const dir = newTempDir();
    tempDirs.push(dir);
    const config = newConfig(dir, "test-key");
    fs.writeJsonSync(path.join(dir, "summary.json"), {
      "user-1": {
        itemCount: 2,
        summary: "## Old Summary",
        generatedAt: PREVIOUS_GENERATED_AT,
        status: "error",
        error: "LLM down",
        errorAt: "2026-11-01T09:00:00.000Z",
      },
    });
    await SummaryInit({} as any, config);

    const cached = await SummaryGetCached("user-1");

    expect(cached.status).toBe("error");
    expect(cached.error).toBe("LLM down");
    expect(cached.summary).toBe("## Old Summary");
    expect(cached.generatedAt.toISOString()).toBe(PREVIOUS_GENERATED_AT);
    expect(cached.errorAt.toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });

  test("SummaryGetCached reads a legacy entry as ok", async () => {
    const dir = newTempDir();
    tempDirs.push(dir);
    const config = newConfig(dir, "test-key");
    fs.writeJsonSync(path.join(dir, "summary.json"), {
      "user-1": {
        itemCount: 1,
        summary: "## Legacy",
        generatedAt: PREVIOUS_GENERATED_AT,
      },
    });
    await SummaryInit({} as any, config);

    const cached = await SummaryGetCached("user-1");

    expect(cached.status).toBe("ok");
    expect(cached.error).toBeNull();
    expect(cached.errorAt).toBeNull();
  });
});
