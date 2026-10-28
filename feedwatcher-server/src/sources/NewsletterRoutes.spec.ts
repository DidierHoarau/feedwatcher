import Fastify, { FastifyInstance } from "fastify";
import { ConfigGet } from "../Config";
import { AuthGetUserSession } from "../users/Auth";
import { UsersDataGet } from "../users/UsersData";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
} from "../procesors/Processors";
import {
  NEWSLETTER_PROVIDER,
  NewsletterError,
  NewsletterGetFeeds,
} from "./NewsletterClient";
import { NewsletterRoutes } from "./NewsletterRoutes";
import {
  NewsletterBackfillProviders,
  NewsletterRepairProviderSources,
} from "./NewsletterProvider";
import { SourceLabelsDataSetSourceLabels } from "./SourceLabelsData";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";

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

jest.mock("../Config", () => ({
  ConfigGet: jest.fn(),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("../users/UsersData", () => ({
  UsersDataGet: jest.fn(),
}));

jest.mock("../procesors/Processors", () => ({
  ProcessorsCheckSource: jest.fn(),
  ProcessorsFetchSourceItems: jest.fn(),
}));

jest.mock("./NewsletterClient", () => {
  class NewsletterError extends Error {
    public code: string;
    public statusCode: number;
    constructor(code: string, statusCode: number, message: string) {
      super(message);
      this.name = "NewsletterError";
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    NewsletterError,
    NewsletterGetFeeds: jest.fn(),
    NEWSLETTER_PROVIDER: "feedwatcher-newsletter",
  };
});

jest.mock("./SourcesData", () => ({
  SourcesDataAdd: jest.fn(),
  SourcesDataListForUser: jest.fn(),
}));

jest.mock("./NewsletterProvider", () => ({
  NewsletterBackfillProviders: jest.fn(),
  NewsletterRepairProviderSources: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataSetSourceLabels: jest.fn(),
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  DbUtilsWithLock: jest.fn((_lock: string, callback: () => any) => callback()),
}));

const CATALOGUE = ["alpha", "beta", "gamma", "delta"].map((feedId) => ({
  providerFeedId: feedId,
  title: `${feedId} title`,
  senderName: `${feedId} sender`,
  senderEmail: `${feedId}@example.com`,
  itemCount: 5,
  latestDate: "2026-10-27T06:00:00.000Z",
  feedUrl: `https://newsletter.example/rss/${feedId}.token`,
}));

describe("NewsletterRoutes", () => {
  let fastify: FastifyInstance;
  let storedSources: any[];

  async function buildApp() {
    fastify = Fastify();
    await new NewsletterRoutes().getRoutes(fastify);
    await fastify.ready();
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    storedSources = [];
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(ConfigGet).mockReturnValue({
      NEWSLETTER_URL: "https://newsletter.example",
      PROCESSOR_CONCURRENCY: 2,
    } as any);
    jest.mocked(NewsletterGetFeeds).mockResolvedValue(CATALOGUE as any);
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      settings: { newsletter: { ignoredFeedIds: [] } },
    } as any);
    jest
      .mocked(SourcesDataListForUser)
      .mockImplementation(async () =>
        storedSources.map((source) => ({
          ...source,
          info: { ...source.info },
        })),
      );
    jest
      .mocked(SourcesDataAdd)
      .mockImplementation(async (_span: any, source: any) => {
        storedSources.push(source);
      });
    jest
      .mocked(SourceLabelsDataSetSourceLabels)
      .mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItems).mockResolvedValue(undefined);
    jest.mocked(NewsletterBackfillProviders).mockResolvedValue({
      scanned: 0,
      tagged: 0,
    });
    jest.mocked(NewsletterRepairProviderSources).mockResolvedValue({
      dryRun: true,
      catalogueAvailable: true,
      backfilled: 0,
      repaired: [],
      orphaned: [],
      unchanged: 0,
      unverified: 0,
    });
    jest
      .mocked(ProcessorsCheckSource)
      .mockImplementation(async (_span: any, source: any) => {
        source.info.processorPath = "/processors/800-RssProcessor.js";
        return null;
      });
    await buildApp();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe("GET /", () => {
    test("returns 403 when unauthenticated", async () => {
      jest
        .mocked(AuthGetUserSession)
        .mockResolvedValue({ isAuthenticated: false } as any);
      const response = await fastify.inject({
        method: "GET",
        url: "/",
      });
      expect(response.statusCode).toBe(403);
    });

    test("reports disabled and skips the upstream call when unconfigured", async () => {
      jest
        .mocked(ConfigGet)
        .mockReturnValue({ NEWSLETTER_URL: "" } as any);

      const response = await fastify.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ enabled: false, feeds: [] });
      expect(NewsletterGetFeeds).not.toHaveBeenCalled();
    });

    test("overlays added, ignored and available states", async () => {
      storedSources = [
        {
          id: "source-legacy",
          info: { url: "https://other-host.example/rss/beta.token" },
        },
        {
          id: "source-primary",
          info: {
            url: "https://newsletter.example/rss/unrelated",
            provider: NEWSLETTER_PROVIDER,
            providerFeedId: "gamma",
          },
        },
      ];
      jest.mocked(UsersDataGet).mockResolvedValue({
        id: "user-1",
        settings: { newsletter: { ignoredFeedIds: ["delta"] } },
      } as any);

      const response = await fastify.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.enabled).toBe(true);
      expect(
        payload.feeds.map((feed: any) => [
          feed.providerFeedId,
          feed.state,
          feed.existingSourceId,
        ]),
      ).toEqual([
        ["alpha", "available", undefined],
        ["beta", "added", "source-legacy"],
        ["gamma", "added", "source-primary"],
        ["delta", "ignored", undefined],
      ]);
      expect(payload.feeds[0]).toMatchObject({
        itemCount: 5,
        latestDate: "2026-10-27T06:00:00.000Z",
        senderName: "alpha sender",
        senderEmail: "alpha@example.com",
        feedUrl: "https://newsletter.example/rss/alpha.token",
      });
    });

    test("forces a refresh when refresh=1 is passed", async () => {
      await fastify.inject({ method: "GET", url: "/?refresh=1" });
      expect(NewsletterGetFeeds).toHaveBeenCalledWith({ force: true });

      await fastify.inject({ method: "GET", url: "/" });
      expect(NewsletterGetFeeds).toHaveBeenLastCalledWith({ force: false });
    });

    test("maps an upstream failure to its status and code", async () => {
      jest
        .mocked(NewsletterGetFeeds)
        .mockRejectedValue(
          new NewsletterError(
            "newsletter_timeout",
            504,
            "The newsletter service did not answer in time.",
          ),
        );

      const response = await fastify.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(504);
      expect(JSON.parse(response.body)).toEqual({
        error: "The newsletter service did not answer in time.",
        code: "newsletter_timeout",
      });
    });
  });

  describe("POST /subscribe", () => {
    test("returns 403 when unauthenticated", async () => {
      jest
        .mocked(AuthGetUserSession)
        .mockResolvedValue({ isAuthenticated: false } as any);
      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha"] },
      });
      expect(response.statusCode).toBe(403);
    });

    test.each([
      [{}, "missing feedIds"],
      [{ feedIds: [] }, "empty feedIds"],
      [{ feedIds: ["alpha", 42] }, "non-string feed id"],
      [{ feedIds: ["  "] }, "blank feed id"],
      [{ feedIds: ["a".repeat(129)] }, "oversized feed id"],
      [
        { feedIds: Array.from({ length: 101 }, (_v, i) => `feed-${i}`) },
        "too many feed ids",
      ],
      [{ feedIds: ["alpha"], label: 42 }, "non-string label"],
      [{ feedIds: ["alpha"], label: "a".repeat(201) }, "oversized label"],
      [{ feedIds: ["alpha"], label: "bad\u0000label" }, "control chars"],
      [{ feedIds: ["alpha"], includeIgnored: "yes" }, "non-boolean flag"],
    ])("validates the body: %j (%s)", async (payload, _description) => {
      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(SourcesDataAdd).not.toHaveBeenCalled();
    });

    test("returns 503 when the integration is disabled", async () => {
      jest
        .mocked(ConfigGet)
        .mockReturnValue({ NEWSLETTER_URL: "" } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha"] },
      });

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body).code).toBe("newsletter_disabled");
      expect(NewsletterGetFeeds).not.toHaveBeenCalled();
    });

    test("adds the selected feeds with provider metadata and the default label", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: {
          feedIds: ["alpha", "beta", "gamma"],
          // A client-supplied URL must never be used.
          urls: { alpha: "https://evil.example/rss/alpha" },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.existing).toEqual([]);
      expect(payload.failed).toEqual([]);
      expect(payload.ignored).toEqual([]);
      expect(payload.added.map((entry: any) => entry.feedId).sort()).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);

      expect(SourcesDataAdd).toHaveBeenCalledTimes(3);
      const addedSource = jest.mocked(SourcesDataAdd).mock.calls[0][1];
      expect(addedSource.info).toEqual({
        url: "https://newsletter.example/rss/alpha.token",
        provider: "feedwatcher-newsletter",
        providerFeedId: "alpha",
        providerUrl: "https://newsletter.example/rss/alpha.token",
        processorPath: "/processors/800-RssProcessor.js",
      });
      expect(
        jest.mocked(SourcesDataAdd).mock.calls.every(
          (_call, index) =>
            jest.mocked(SourcesDataAdd).mock.calls[index][1].info.url !==
            "https://evil.example/rss/alpha",
        ),
      ).toBe(true);
      expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledTimes(3);
      expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        ["Newsletters"],
      );
      expect(ProcessorsFetchSourceItems).toHaveBeenCalledTimes(3);
    });

    test("uses a custom label and dedupes repeated feed ids", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha", "alpha", "beta"], label: "  News  " },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).added).toHaveLength(2);
      expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        ["News"],
      );
    });

    test("repeating the request reports existing sources and creates nothing", async () => {
      await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha", "beta", "gamma"] },
      });
      jest.mocked(SourcesDataAdd).mockClear();
      jest.mocked(ProcessorsCheckSource).mockClear();
      jest.mocked(ProcessorsFetchSourceItems).mockClear();

      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha", "beta", "gamma"] },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.added).toEqual([]);
      expect(payload.existing.map((entry: any) => entry.feedId).sort()).toEqual([
        "alpha",
        "beta",
        "gamma",
      ]);
      expect(SourcesDataAdd).not.toHaveBeenCalled();
      expect(ProcessorsCheckSource).not.toHaveBeenCalled();
      expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
    });

    test("skips ignored feeds unless includeIgnored is set", async () => {
      jest.mocked(UsersDataGet).mockResolvedValue({
        id: "user-1",
        settings: { newsletter: { ignoredFeedIds: ["beta"] } },
      } as any);

      const skipped = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha", "beta"] },
      });
      expect(JSON.parse(skipped.body).ignored).toEqual(["beta"]);
      expect(JSON.parse(skipped.body).added).toHaveLength(1);
      expect(SourcesDataAdd).toHaveBeenCalledTimes(1);

      const forced = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["beta"], includeIgnored: true },
      });
      expect(JSON.parse(forced.body).added).toHaveLength(1);
      expect(JSON.parse(forced.body).ignored).toEqual([]);
      expect(SourcesDataAdd).toHaveBeenCalledTimes(2);
    });

    test("reports unknown feed ids as failed", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha", "unknown"] },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.added).toHaveLength(1);
      expect(payload.failed).toHaveLength(1);
      expect(payload.failed[0].feedId).toBe("unknown");
      expect(payload.failed[0].error).toMatch(/not offered/);
    });

    test("reports a feed with no matching processor as failed", async () => {
      jest
        .mocked(ProcessorsCheckSource)
        .mockImplementation(async () => "no processor matched");

      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha"] },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.added).toEqual([]);
      expect(payload.failed).toEqual([
        { feedId: "alpha", error: "no processor matched" },
      ]);
      expect(SourcesDataAdd).not.toHaveBeenCalled();
    });

    test("returns the upstream failure and adds nothing", async () => {
      jest
        .mocked(NewsletterGetFeeds)
        .mockRejectedValue(
          new NewsletterError(
            "newsletter_unreachable",
            502,
            "The newsletter service is unreachable.",
          ),
        );

      const response = await fastify.inject({
        method: "POST",
        url: "/subscribe",
        payload: { feedIds: ["alpha"] },
      });

      expect(response.statusCode).toBe(502);
      expect(JSON.parse(response.body).code).toBe("newsletter_unreachable");
      expect(SourcesDataAdd).not.toHaveBeenCalled();
    });
  });

  describe("POST /repair", () => {
    test("returns 403 when unauthenticated", async () => {
      jest
        .mocked(AuthGetUserSession)
        .mockResolvedValue({ isAuthenticated: false } as any);
      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(NewsletterRepairProviderSources).not.toHaveBeenCalled();
    });

    test("returns 503 when the integration is disabled", async () => {
      jest
        .mocked(ConfigGet)
        .mockReturnValue({ NEWSLETTER_URL: "" } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: {},
      });

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body).code).toBe("newsletter_disabled");
      expect(NewsletterBackfillProviders).not.toHaveBeenCalled();
      expect(NewsletterRepairProviderSources).not.toHaveBeenCalled();
    });

    test("rejects a non-boolean dryRun with 400", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: { dryRun: "yes" },
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe("Invalid: dryRun");
      expect(NewsletterRepairProviderSources).not.toHaveBeenCalled();
    });

    test("defaults to a dry run and reports the backfill result", async () => {
      jest.mocked(NewsletterBackfillProviders).mockResolvedValue({
        scanned: 4,
        tagged: 2,
      });
      jest.mocked(NewsletterRepairProviderSources).mockResolvedValue({
        dryRun: true,
        catalogueAvailable: true,
        backfilled: 2,
        repaired: [{ sourceId: "source-1", sourceName: "Alpha", feedId: "alpha" }],
        orphaned: [],
        unchanged: 1,
        unverified: 0,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        dryRun: true,
        backfilled: 2,
        repaired: [{ sourceId: "source-1", feedId: "alpha" }],
      });
      expect(NewsletterBackfillProviders).toHaveBeenCalledWith(expect.anything(), {
        useCatalogue: true,
        userId: "user-1",
      });
      expect(NewsletterRepairProviderSources).toHaveBeenCalledWith(
        expect.anything(),
        { userId: "user-1", dryRun: true, backfilled: 2 },
      );
    });

    test("applies the repair when dryRun is false", async () => {
      jest.mocked(NewsletterRepairProviderSources).mockResolvedValue({
        dryRun: false,
        catalogueAvailable: true,
        backfilled: 0,
        repaired: [{ sourceId: "source-1", sourceName: "Alpha", feedId: "alpha" }],
        orphaned: [{ sourceId: "source-2", sourceName: "Beta", feedId: "beta" }],
        unchanged: 0,
        unverified: 0,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: { dryRun: false },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).orphaned).toEqual([
        { sourceId: "source-2", sourceName: "Beta", feedId: "beta" },
      ]);
      expect(NewsletterRepairProviderSources).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
      );
    });

    test("maps an upstream failure to its status and code", async () => {
      jest
        .mocked(NewsletterBackfillProviders)
        .mockRejectedValue(
          new NewsletterError(
            "newsletter_unreachable",
            502,
            "The newsletter service is unreachable.",
          ),
        );

      const response = await fastify.inject({
        method: "POST",
        url: "/repair",
        payload: {},
      });

      expect(response.statusCode).toBe(502);
      expect(JSON.parse(response.body)).toEqual({
        error: "The newsletter service is unreachable.",
        code: "newsletter_unreachable",
      });
      expect(NewsletterRepairProviderSources).not.toHaveBeenCalled();
    });
  });
});
