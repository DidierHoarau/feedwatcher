import Fastify, { FastifyInstance } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import { XMLParser } from "fast-xml-parser";
import { SourcesImportRoutes } from "./SourcesImportRoutes";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";
import { AuthGetUserSession } from "../users/Auth";
import { ConfigGet } from "../Config";
import { SourcesDataListForUser } from "./SourcesData";
import {
  SourcesExportDataItemsForUser,
  SourcesExportDataListForUser,
} from "./SourcesExportData";
import { NewsletterResolveProviderForUrl } from "./NewsletterProvider";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataListForUser: jest.fn(),
}));

jest.mock("../Config", () => ({
  ConfigGet: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataListForUser: jest.fn(),
}));

jest.mock("./SourcesExportData", () => ({
  SourcesExportDataListForUser: jest.fn(),
  SourcesExportDataItemsForUser: jest.fn(),
}));

jest.mock("./NewsletterProvider", () => ({
  ...jest.requireActual("./NewsletterProvider"),
  NewsletterResolveProviderForUrl: jest.fn(),
}));

const OPML_INPUT = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Feed A" type="rss" xmlUrl="https://a.example/feed.xml"/>
    </outline>
    <outline text="Feed B" type="rss" xmlUrl="https://b.example/feed.xml"/>
  </body>
</opml>`;

async function buildFastify(): Promise<FastifyInstance> {
  const fastify = Fastify();
  await fastify.register(fastifyMultipart);
  await new SourcesImportRoutes().getRoutes(fastify);
  await fastify.ready();
  return fastify;
}

describe("SourcesImportRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(ConfigGet).mockReturnValue({ NEWSLETTER_URL: "" } as any);
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);
    jest.mocked(SourcesExportDataListForUser).mockResolvedValue([]);
    jest.mocked(SourcesExportDataItemsForUser).mockResolvedValue([]);
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue(null);
  });

  function opmlPayload(opmlText: string): Buffer {
    const boundary = "----test-boundary";
    return Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="feeds.opml"\r\nContent-Type: text/xml\r\n\r\n`
      ),
      Buffer.from(opmlText),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  }

  async function importOpml(
    fastify: FastifyInstance,
    opmlText: string
  ): Promise<any> {
    const response = await fastify.inject({
      method: "POST",
      url: "/analyze/opml",
      headers: {
        "content-type": "multipart/form-data; boundary=----test-boundary",
      },
      payload: opmlPayload(opmlText),
    });
    return response;
  }

  test("analyzes an OPML document with nested folders (M12)", async () => {
    const fastify = await buildFastify();
    const boundary = "----test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="feeds.opml"\r\nContent-Type: text/xml\r\n\r\n`
      ),
      Buffer.from(OPML_INPUT),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await fastify.inject({
      method: "POST",
      url: "/analyze/opml",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0].name).toBe("Feed A");
    expect(body.sources[0].info.url).toBe("https://a.example/feed.xml");
    expect(body.sources[0].labels).toEqual(["Tech"]);
    expect(body.sources[1].name).toBe("Feed B");
    await fastify.close();
  });

  test("rejects an invalid OPML document with 400 (M12)", async () => {
    const fastify = await buildFastify();
    const boundary = "----test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="x.opml"\r\nContent-Type: text/xml\r\n\r\n`
      ),
      Buffer.from("this is not xml at all <<<"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await fastify.inject({
      method: "POST",
      url: "/analyze/opml",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(400);
    await fastify.close();
  });

  test("exports a re-importable OPML with correct headers (M12, L5)", async () => {
    jest.mocked(SourceLabelsDataListForUser).mockResolvedValue([
      {
        sourceName: "Feed A",
        sourceInfo: { icon: "rss", url: "https://a.example/feed.xml" },
        labelName: "Tech",
      },
      {
        sourceName: "Feed B",
        sourceInfo: { icon: "podcast", url: "https://b.example/feed.xml" },
        labelName: "",
      },
    ] as any);
    const fastify = await buildFastify();

    const response = await fastify.inject({
      method: "GET",
      url: "/export/opml",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/x-opml");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="feedwatcher.opml"'
    );

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
      isArray: (name) => name === "outline",
    });
    const parsed = parser.parse(response.body);
    const outlines = parsed.opml.body.outline;
    expect(outlines).toHaveLength(2);
    const folder = outlines.find((outline: any) => outline.title === "Tech");
    expect(folder).toBeTruthy();
    expect(folder.outline[0].text).toBe("Feed A");
    expect(folder.outline[0].xmlUrl).toBe("https://a.example/feed.xml");
    const direct = outlines.find((outline: any) => outline.text === "Feed B");
    expect(direct).toBeTruthy();
    expect(direct.url).toBe("https://b.example/feed.xml");
    await fastify.close();
  });

  test("returns 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const fastify = await buildFastify();
    const response = await fastify.inject({
      method: "GET",
      url: "/export/opml",
    });
    expect(response.statusCode).toBe(403);
    await fastify.close();
  });

  test("tags newsletter feeds and flags existing sources by feed id", async () => {
    jest.mocked(ConfigGet).mockReturnValue({
      NEWSLETTER_URL: "https://newsletter.example",
    } as any);
    jest
      .mocked(NewsletterResolveProviderForUrl)
      .mockImplementation(async (url: string) =>
        url.includes("newsletter.example")
          ? {
              provider: "feedwatcher-newsletter",
              providerFeedId: "alpha",
              providerUrl: "https://newsletter.example/rss/alpha.token",
            }
          : null
      );
    jest.mocked(SourcesDataListForUser).mockResolvedValue([
      {
        id: "source-1",
        info: {
          url: "https://newsletter.example/rss/alpha",
          provider: "feedwatcher-newsletter",
          providerFeedId: "alpha",
        },
      },
    ] as any);

    const fastify = await buildFastify();
    const response = await importOpml(
      fastify,
      `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Alpha" type="rss" xmlUrl="https://newsletter.example/rss/alpha.rotated"/>
    <outline text="Feed B" type="rss" xmlUrl="https://b.example/feed.xml"/>
  </body>
</opml>`
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const newsletter = body.sources.find((source: any) =>
      source.info.url.includes("newsletter.example")
    );
    expect(newsletter.info.provider).toBe("feedwatcher-newsletter");
    expect(newsletter.info.providerFeedId).toBe("alpha");
    expect(newsletter.existingSourceId).toBe("source-1");
    const other = body.sources.find(
      (source: any) => source.info.url === "https://b.example/feed.xml"
    );
    expect(other.info.provider).toBeUndefined();
    expect(other.existingSourceId).toBeUndefined();
    await fastify.close();
  });

  test("leaves OPML sources untouched when the newsletter integration is disabled", async () => {
    const fastify = await buildFastify();
    const response = await importOpml(fastify, OPML_INPUT);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sources.every((source: any) => !source.info.provider)).toBe(true);
    expect(
      body.sources.every((source: any) => source.existingSourceId === undefined)
    ).toBe(true);
    expect(NewsletterResolveProviderForUrl).not.toHaveBeenCalled();
    expect(SourcesDataListForUser).not.toHaveBeenCalled();
    await fastify.close();
  });

  test("returns 403 for the JSON export when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const fastify = await buildFastify();
    const response = await fastify.inject({
      method: "GET",
      url: "/export/json",
    });
    expect(response.statusCode).toBe(403);
    expect(SourcesExportDataListForUser).not.toHaveBeenCalled();
    await fastify.close();
  });

  test("exports the caller's sources as a JSON attachment without items", async () => {
    jest.mocked(SourcesExportDataListForUser).mockResolvedValue([
      {
        id: "source-1",
        name: "Feed A",
        info: { url: "https://a.example/feed.xml", processorPath: "p.js" },
        labels: ["Tech"],
      },
    ]);
    const fastify = await buildFastify();

    const response = await fastify.inject({
      method: "GET",
      url: "/export/json",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="feedwatcher.json"'
    );
    const body = JSON.parse(response.body);
    expect(body.format).toBe("feedwatcher-sources");
    expect(body.version).toBe(1);
    expect(typeof body.exportedAt).toBe("string");
    expect(body.sources).toEqual([
      {
        id: "source-1",
        name: "Feed A",
        info: { url: "https://a.example/feed.xml", processorPath: "p.js" },
        labels: ["Tech"],
      },
    ]);
    expect(body.items).toBeUndefined();
    expect(SourcesExportDataItemsForUser).not.toHaveBeenCalled();
    await fastify.close();
  });

  test("streams every item page when includeItems is set", async () => {
    jest.mocked(SourcesExportDataListForUser).mockResolvedValue([]);
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `item-${String(index).padStart(4, "0")}`,
      sourceId: "source-1",
      title: `Item ${index}`,
      content: "content",
      url: "https://example.com/item",
      status: "unread",
      datePublished: "2026-01-01T00:00:00.000Z",
      thumbnail: null,
      info: {},
    }));
    const secondPage = [
      {
        id: "item-9999",
        sourceId: "source-1",
        title: "Last",
        content: "content",
        url: "https://example.com/last",
        status: "read",
        datePublished: "2026-01-02T00:00:00.000Z",
        thumbnail: null,
        info: { author: "Someone" },
      },
    ];
    jest
      .mocked(SourcesExportDataItemsForUser)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const fastify = await buildFastify();

    const response = await fastify.inject({
      method: "GET",
      url: "/export/json?includeItems=true",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(501);
    expect(body.items[0].id).toBe("item-0000");
    expect(body.items[500].id).toBe("item-9999");
    expect(body.items[500].info).toEqual({ author: "Someone" });
    expect(SourcesExportDataItemsForUser).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "user-1",
      "",
      500
    );
    expect(SourcesExportDataItemsForUser).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "user-1",
      "item-0499",
      500
    );
    await fastify.close();
  });
});
