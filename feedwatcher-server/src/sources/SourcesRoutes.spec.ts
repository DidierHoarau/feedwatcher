import Fastify, { FastifyInstance } from "fastify";
import { SourcesRoutes } from "./SourcesRoutes";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
  ProcessorsFetchSourceItemsForUser,
  ProcessorsPreviewSource,
} from "../procesors/Processors";
import { AuthGetUserSession } from "../users/Auth";
import { UrlSafetyError, UrlSafetyFetchText } from "../utils-std-ts/UrlSafety";
import { NewsletterResolveProviderForUrl } from "./NewsletterProvider";

jest.mock("./NewsletterProvider", () => ({
  ...jest.requireActual("./NewsletterProvider"),
  NewsletterResolveProviderForUrl: jest.fn(),
}));

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

jest.mock("../procesors/Processors", () => ({
  ProcessorsCheckSource: jest.fn(),
  ProcessorsFetchSourceItems: jest.fn(),
  ProcessorsFetchSourceItemsForUser: jest.fn(),
  ProcessorsPreviewSource: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataAdd: jest.fn(),
  SourcesDataListForUser: jest.fn(),
}));

jest.mock("../utils-std-ts/UrlSafety", () => ({
  UrlSafetyError: class UrlSafetyError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  UrlSafetyFetchText: jest.fn(),
}));

describe("SourcesRoutes", () => {
  let fastify: FastifyInstance;
  const unhandledRejections: unknown[] = [];
  const unhandledHandler = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    unhandledRejections.length = 0;
    process.on("unhandledRejection", unhandledHandler);
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);
    jest.mocked(SourcesDataAdd).mockResolvedValue(undefined);
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue(null);
    jest.mocked(ProcessorsFetchSourceItems).mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItemsForUser).mockResolvedValue(undefined);
    jest.mocked(ProcessorsCheckSource).mockImplementation(async (_span, source: any) => {
      source.info.processorPath = "/processors/800-RssProcessor.js";
      return null;
    });
    fastify = Fastify();
    await new SourcesRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandledHandler);
  });

  test("responds 201 when the background fetch fails, without an unhandled rejection (C2)", async () => {
    jest
      .mocked(ProcessorsFetchSourceItems)
      .mockRejectedValue(new Error("malformed feed"));

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed.xml" },
    });

    expect(response.statusCode).toBe(201);
    expect(ProcessorsFetchSourceItems).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandledRejections).toEqual([]);
  });

  test("responds 200 on manual fetch even when the fetch fails (C2)", async () => {
    jest
      .mocked(ProcessorsFetchSourceItemsForUser)
      .mockRejectedValue(new Error("malformed feed"));

    const response = await fastify.inject({ method: "PUT", url: "/fetch" });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandledRejections).toEqual([]);
  });

  test("rejects a source with no url with 400", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("rejects a duplicate normalized url with 409 (M15)", async () => {
    jest.mocked(SourcesDataListForUser).mockResolvedValue([
      { info: { url: "https://example.com/feed" } },
    ] as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://EXAMPLE.com/feed/" },
    });

    expect(response.statusCode).toBe(409);
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("accepts the same url for a different user (M15)", async () => {
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed" },
    });

    expect(response.statusCode).toBe(201);
  });

  test("tags a newsletter source with provider metadata on add", async () => {
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue({
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.token",
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://newsletter.example/rss/alpha.token" },
    });

    expect(response.statusCode).toBe(201);
    const added = jest.mocked(SourcesDataAdd).mock.calls[0][1] as any;
    expect(added.info).toEqual({
      url: "https://newsletter.example/rss/alpha.token",
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.token",
      processorPath: "/processors/800-RssProcessor.js",
    });
  });

  test("rejects a rotated token for an existing newsletter feed with 409", async () => {
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue({
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.rotated",
    });
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

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://newsletter.example/rss/alpha.rotated" },
    });

    expect(response.statusCode).toBe(409);
    expect(SourcesDataAdd).not.toHaveBeenCalled();
  });

  test("does not tag a non-newsletter source", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed.xml" },
    });

    expect(response.statusCode).toBe(201);
    const added = jest.mocked(SourcesDataAdd).mock.calls[0][1] as any;
    expect(added.info).toEqual({
      url: "https://example.com/feed.xml",
      processorPath: "/processors/800-RssProcessor.js",
    });
  });

  test("responds 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed.xml" },
    });
    expect(response.statusCode).toBe(403);
  });

  describe("GET /discover", () => {
    test("responds 403 when unauthenticated", async () => {
      jest.mocked(AuthGetUserSession).mockResolvedValue({
        isAuthenticated: false,
      });
      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://example.com",
      });
      expect(response.statusCode).toBe(403);
      expect(UrlSafetyFetchText).not.toHaveBeenCalled();
    });

    test("responds 400 when the url is missing", async () => {
      const response = await fastify.inject({ method: "GET", url: "/discover" });
      expect(response.statusCode).toBe(400);
      expect(UrlSafetyFetchText).not.toHaveBeenCalled();
    });

    test("extracts feed link tags and resolves relative hrefs", async () => {
      jest.mocked(UrlSafetyFetchText).mockResolvedValue(
        `<html><head>
          <link rel="alternate" type="application/rss+xml" title="Blog Feed" href="/feed.xml">
          <link rel="alternate" type='application/atom+xml' href="atom.xml"/>
          <link rel="stylesheet" href="/style.css">
          <a href="https://elsewhere.example/rss.xml">rss</a>
        </head></html>`,
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://example.com/blog/",
      });

      expect(response.statusCode).toBe(200);
      expect(UrlSafetyFetchText).toHaveBeenCalledWith(
        "https://example.com/blog/",
        expect.arrayContaining(["application/rss+xml", "text/html"]),
        { trustedOrigins: [], headers: {}, rewriteBase: null },
      );
      expect(response.json()).toEqual({
        feeds: [
          {
            url: "https://example.com/feed.xml",
            title: "Blog Feed",
            type: "application/rss+xml",
          },
          {
            url: "https://example.com/blog/atom.xml",
            title: "",
            type: "application/atom+xml",
          },
        ],
      });
    });

    test("returns the url itself when the body is already a feed", async () => {
      jest
        .mocked(UrlSafetyFetchText)
        .mockResolvedValue('<?xml version="1.0"?><rss version="2.0"></rss>');

      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://example.com/feed.xml",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        feeds: [{ url: "https://example.com/feed.xml", title: "", type: "" }],
      });
    });

    test("responds 200 with an empty list when no feed is found", async () => {
      jest
        .mocked(UrlSafetyFetchText)
        .mockResolvedValue("<html><body>No feeds here</body></html>");

      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://example.com",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ feeds: [] });
    });

    test("passes trusted fetch options when the url resolves to a newsletter feed", async () => {
      jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue({
        provider: "feedwatcher-newsletter",
        providerFeedId: "alpha",
        providerUrl: "https://newsletter.example/rss/alpha.token",
      });
      jest
        .mocked(UrlSafetyFetchText)
        .mockResolvedValue('<rss version="2.0"></rss>');

      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://newsletter.example/rss/alpha.token",
      });

      expect(response.statusCode).toBe(200);
      const call = jest.mocked(UrlSafetyFetchText).mock.calls[0];
      expect(call[0]).toBe("https://newsletter.example/rss/alpha.token");
      const options = call[2] as any;
      expect(options.rewriteBase).toBeNull();
      expect(options.trustedOrigins).toEqual(
        expect.arrayContaining(["https://newsletter.example"]),
      );
    });

    test("maps the UrlSafety error status code onto the response", async () => {
      jest
        .mocked(UrlSafetyFetchText)
        .mockRejectedValue(new UrlSafetyError("Unsupported content type", 415));

      const response = await fastify.inject({
        method: "GET",
        url: "/discover?url=https://example.com",
      });

      expect(response.statusCode).toBe(415);
      expect(response.json()).toEqual({ error: "Unsupported content type" });
    });
  });

  describe("POST /preview", () => {
    test("responds 403 when unauthenticated", async () => {
      jest.mocked(AuthGetUserSession).mockResolvedValue({
        isAuthenticated: false,
      });
      const response = await fastify.inject({
        method: "POST",
        url: "/preview",
        payload: { url: "https://example.com/feed.xml" },
      });
      expect(response.statusCode).toBe(403);
      expect(ProcessorsPreviewSource).not.toHaveBeenCalled();
    });

    test("responds 400 when the url is missing", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/preview",
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(ProcessorsPreviewSource).not.toHaveBeenCalled();
    });

    test("returns the processor info and item preview", async () => {
      jest.mocked(ProcessorsPreviewSource).mockResolvedValue({
        preview: {
          processorTitle: "RSS Feed",
          processorIcon: "rss",
          name: "Example Feed",
          items: [
            {
              title: "Item 1",
              url: "https://example.com/1",
              datePublished: new Date("2026-01-01T00:00:00Z"),
              thumbnail: "https://example.com/1.jpg",
            },
          ],
        },
        error: null,
      } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/preview",
        payload: { url: "https://example.com/feed.xml" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        processor: { title: "RSS Feed", icon: "rss" },
        name: "Example Feed",
        items: [
          {
            title: "Item 1",
            url: "https://example.com/1",
            datePublished: new Date("2026-01-01T00:00:00Z").toISOString(),
            thumbnail: "https://example.com/1.jpg",
          },
        ],
      });
      const sourceArg = jest.mocked(ProcessorsPreviewSource).mock.calls[0][1] as any;
      expect(sourceArg.info.url).toBe("https://example.com/feed.xml");
      expect(sourceArg.userId).toBe("user-1");
    });

    test("responds 400 when no processor matches, without persisting anything", async () => {
      jest.mocked(ProcessorsPreviewSource).mockResolvedValue({
        preview: null,
        error: "Failed to fetch URL (HTTP 404)",
      } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/preview",
        payload: { url: "https://example.com/not-a-feed" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error:
          "Source Not Supported (No Processor Matching): Failed to fetch URL (HTTP 404)",
      });
      expect(SourcesDataAdd).not.toHaveBeenCalled();
    });
  });
});
