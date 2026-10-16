import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Source } from "../../model/Source";
import { ProcessorsInit, ProcessorsPreviewSource } from "../Processors";
import { SourcesDataUpdate } from "../../sources/SourcesData";

jest.mock("../../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
  OTelTracer: () => ({
    startSpan: () => ({ end: jest.fn(), setAttributes: jest.fn() }),
  }),
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("../../sources/SourcesData", () => ({
  SourcesDataUpdate: jest.fn(),
  SourcesDataListForUser: jest.fn(),
}));

// CommonJS fixture processors loaded by ProcessorsInit from a temp dir.
const MATCH_PROCESSOR = `
module.exports = {
  getInfo: () => ({ title: "Match Processor", description: "", icon: "match" }),
  test: async (source) => {
    if (source.info.url && source.info.url.includes("match")) {
      return { name: "Matched Feed", icon: "match" };
    }
    return null;
  },
  fetchLatest: async () => {
    const items = [];
    for (let i = 1; i <= 7; i++) {
      items.push({
        title: "Item " + i,
        url: "https://example.com/" + i,
        content: "<p>content " + i + "</p>",
        datePublished: new Date("2026-01-0" + i + "T00:00:00Z"),
        thumbnail: "https://example.com/" + i + ".jpg",
      });
    }
    return items;
  },
};
`;

const NEVER_PROCESSOR = `
module.exports = {
  getInfo: () => ({ title: "Never Processor", description: "", icon: "never" }),
  test: async () => null,
  fetchLatest: async () => [],
};
`;

const THROWING_PROCESSOR = `
module.exports = {
  getInfo: () => ({ title: "Throwing Processor", description: "", icon: "throwing" }),
  test: async (source) => {
    if (source.info.url && source.info.url.includes("boom")) {
      throw new Error("Throwing processor exploded");
    }
    return null;
  },
  fetchLatest: async () => [],
};
`;

describe("ProcessorsPreviewSource", () => {
  let processorsUserDir: string;
  let processorsSystemDir: string;

  beforeAll(async () => {
    processorsUserDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-preview-user-"));
    processorsSystemDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-preview-system-"),
    );
    await fs.writeFile(
      path.join(processorsSystemDir, "100-MatchProcessor.js"),
      MATCH_PROCESSOR,
    );
    await fs.writeFile(
      path.join(processorsSystemDir, "200-NeverProcessor.js"),
      NEVER_PROCESSOR,
    );
    await fs.writeFile(
      path.join(processorsUserDir, "300-ThrowingProcessor.js"),
      THROWING_PROCESSOR,
    );
    await ProcessorsInit({} as any, {
      PROCESSORS_USER: processorsUserDir,
      PROCESSORS_SYSTEM: processorsSystemDir,
    } as any);
  });

  afterAll(async () => {
    await fs.remove(processorsUserDir);
    await fs.remove(processorsSystemDir);
  });

  function newSource(url: string): Source {
    const source = new Source();
    source.userId = "user-1";
    source.info = { url };
    return source;
  }

  test("maps the first matching processor and at most 5 items without content", async () => {
    const source = newSource("https://example.com/match");
    const { preview, error } = await ProcessorsPreviewSource({} as any, source);

    expect(error).toBeNull();
    expect(preview).toEqual({
      processorTitle: "Match Processor",
      processorIcon: "match",
      name: "Matched Feed",
      items: [
        {
          title: "Item 1",
          url: "https://example.com/1",
          datePublished: new Date("2026-01-01T00:00:00Z"),
          thumbnail: "https://example.com/1.jpg",
        },
        {
          title: "Item 2",
          url: "https://example.com/2",
          datePublished: new Date("2026-01-02T00:00:00Z"),
          thumbnail: "https://example.com/2.jpg",
        },
        {
          title: "Item 3",
          url: "https://example.com/3",
          datePublished: new Date("2026-01-03T00:00:00Z"),
          thumbnail: "https://example.com/3.jpg",
        },
        {
          title: "Item 4",
          url: "https://example.com/4",
          datePublished: new Date("2026-01-04T00:00:00Z"),
          thumbnail: "https://example.com/4.jpg",
        },
        {
          title: "Item 5",
          url: "https://example.com/5",
          datePublished: new Date("2026-01-05T00:00:00Z"),
          thumbnail: "https://example.com/5.jpg",
        },
      ],
    });
    for (const item of preview!.items) {
      expect(item).not.toHaveProperty("content");
    }
  });

  test("returns a null preview when no processor matches", async () => {
    const source = newSource("https://example.com/nothing-here");
    const { preview, error } = await ProcessorsPreviewSource({} as any, source);

    expect(preview).toBeNull();
    expect(error).toBeNull();
  });

  test("surfaces the last processor error when the preview fails", async () => {
    const source = newSource("https://example.com/boom");
    const { preview, error } = await ProcessorsPreviewSource({} as any, source);

    expect(preview).toBeNull();
    expect(error).toBe("Throwing processor exploded");
  });

  test("does not persist anything for a transient source", async () => {
    const source = newSource("https://example.com/match");
    await ProcessorsPreviewSource({} as any, source);

    expect(SourcesDataUpdate).not.toHaveBeenCalled();
    expect(source.id).toBeDefined();
  });
});
