import Fastify, { FastifyInstance } from "fastify";
import { Source } from "../model/Source";
import { SourcesIdRoutes } from "./SourcesIdRoutes";
import { AuthGetUserSession } from "../users/Auth";
import {
  SourcesDataDelete,
  SourcesDataGet,
  SourcesDataListForUser,
  SourcesDataUpdate,
} from "./SourcesData";
import {
  SourceLabelsDataGetSourceLabels,
  SourceLabelsDataSetSourceLabels,
} from "./SourceLabelsData";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
} from "../procesors/Processors";
import { NewsletterResolveProviderForUrl } from "./NewsletterProvider";

jest.mock("./NewsletterProvider", () => ({
  ...jest.requireActual("./NewsletterProvider"),
  NewsletterResolveProviderForUrl: jest.fn(),
}));

const mockStartSpan = jest.fn(() => ({ end: jest.fn() }));

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
  OTelTracer: () => ({ startSpan: mockStartSpan }),
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

jest.mock("./SourcesData", () => ({
  SourcesDataGet: jest.fn(),
  SourcesDataUpdate: jest.fn(),
  SourcesDataDelete: jest.fn(),
  SourcesDataListForUser: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataGetSourceLabels: jest.fn(),
  SourceLabelsDataSetSourceLabels: jest.fn(),
}));

jest.mock("../procesors/Processors", () => ({
  ProcessorsCheckSource: jest.fn(),
  ProcessorsFetchSourceItems: jest.fn(),
}));

function newSource(userId: string): Source {
  const source = new Source();
  source.id = "source-1";
  source.userId = userId;
  source.name = "My Feed";
  source.info = { url: "https://example.com/feed" };
  return source;
}

describe("SourcesIdRoutes (M1/L3)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStartSpan.mockClear();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    } as any);
    jest.mocked(ProcessorsCheckSource).mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItems).mockResolvedValue(undefined);
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue(null);
    fastify = Fastify();
    await fastify.register(new SourcesIdRoutes().getRoutes, {
      prefix: "/api/sources/:sourceId",
    });
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("GET an unknown source id returns 404 (no null deref)", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(null);
    const response = await fastify.inject({
      method: "GET",
      url: "/api/sources/source-1",
    });
    expect(response.statusCode).toBe(404);
  });

  test("GET another user's source returns 403", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-2"));
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(403);
  });

  test("GET an owned source returns 200", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).id).toBe("source-1");
  });

  test("PUT without a name returns 400, not 401", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
  });

  test("PUT a valid update returns 200 and persists it", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataSetSourceLabels).mockResolvedValue(undefined);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: ["News"] },
    });
    expect(response.statusCode).toBe(200);
    expect(SourcesDataUpdate).toHaveBeenCalled();
    expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
      expect.anything(),
      "source-1",
      ["News"]
    );
  });

  test("PUT with an empty labels array clears all labels", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataSetSourceLabels).mockResolvedValue(undefined);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
      expect.anything(),
      "source-1",
      []
    );
  });

  test("PUT without labels leaves the labels untouched", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed" },
    });
    expect(response.statusCode).toBe(200);
    expect(SourceLabelsDataSetSourceLabels).not.toHaveBeenCalled();
  });

  test("PUT with non-array labels leaves the labels untouched", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: "news" },
    });
    expect(response.statusCode).toBe(200);
    expect(SourceLabelsDataSetSourceLabels).not.toHaveBeenCalled();
  });

  test("PUT with a changed URL updates it and re-detects the processor", async () => {
    const source = newSource("user-1");
    source.info = {
      url: "https://example.com/feed",
      processorPath: "/processors/800-RssProcessor.js",
      dateFetched: new Date("2026-01-01"),
      lastItemDate: new Date("2026-01-02"),
      lastFetchError: "boom",
      lastFetchErrorDate: new Date("2026-01-03"),
      lastFetchErrorStatus: 500,
      lastFetchErrorClass: "http",
      fetchErrorCount: 2,
      autoDisabled: true,
      autoDisabledDate: new Date("2026-01-04"),
      autoDisabledReason: "boom",
      retryAfterUntil: new Date("2026-01-05"),
    };
    jest.mocked(SourcesDataGet).mockResolvedValue(source);
    const namesAtUpdate: string[] = [];
    jest
      .mocked(SourcesDataUpdate)
      .mockImplementation(async (_span, updated: any) => {
        namesAtUpdate.push(updated.name);
      });
    let firstCheckProcessorPath: string | undefined;
    let checkCallCount = 0;
    jest
      .mocked(ProcessorsCheckSource)
      .mockImplementation(async (_span, checkedSource: any) => {
        if (checkCallCount === 0) {
          checkCallCount = 1;
          firstCheckProcessorPath = checkedSource.info.processorPath;
        }
        checkedSource.info.processorPath = "/processors/800-RssProcessor.js";
        checkedSource.name = "Processor Title";
        return null;
      });
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: ["News"], url: " https://example.com/feed.xml " },
    });
    expect(response.statusCode).toBe(200);
    expect(firstCheckProcessorPath).toBeUndefined();
    expect(source.info.url).toBe("https://example.com/feed.xml");
    expect(source.info.dateFetched).toBeUndefined();
    expect(source.info.lastItemDate).toBeUndefined();
    expect(source.info.lastFetchError).toBeUndefined();
    expect(source.info.lastFetchErrorDate).toBeUndefined();
    expect(source.info.lastFetchErrorStatus).toBeUndefined();
    expect(source.info.lastFetchErrorClass).toBeUndefined();
    expect(source.info.fetchErrorCount).toBeUndefined();
    expect(source.info.autoDisabled).toBeUndefined();
    expect(source.info.autoDisabledDate).toBeUndefined();
    expect(source.info.autoDisabledReason).toBeUndefined();
    expect(source.info.retryAfterUntil).toBeUndefined();
    expect(SourcesDataUpdate).toHaveBeenCalled();
    expect(namesAtUpdate[0]).toBe("Renamed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(jest.mocked(ProcessorsFetchSourceItems)).toHaveBeenCalledTimes(1);
    expect(mockStartSpan).toHaveBeenCalledWith("SourceRefreshAfterUpdate");
  });

  test("PUT a name/label-only edit performs no outbound work (M8)", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: ["News"] },
    });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ProcessorsCheckSource).not.toHaveBeenCalled();
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("PUT an unchanged-URL edit performs no outbound work (M8)", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", url: "https://example.com/feed" },
    });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ProcessorsCheckSource).not.toHaveBeenCalled();
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
    expect(mockStartSpan).not.toHaveBeenCalledWith("SourceRefreshAfterUpdate");
  });

  test("PUT with a changed URL that no processor supports returns 400 and persists nothing", async () => {
    const source = newSource("user-1");
    source.info.processorPath = "/processors/800-RssProcessor.js";
    jest.mocked(SourcesDataGet).mockResolvedValue(source);
    jest.mocked(ProcessorsCheckSource).mockResolvedValue(null);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", url: "https://example.com/other" },
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain(
      "Source Not Supported (No Processor Matching)"
    );
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("PUT with a URL matching another source returns 409", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourcesDataListForUser).mockResolvedValue([
      { id: "source-2", info: { url: "https://other.com/feed" } },
    ] as any);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", url: "https://OTHER.com/feed/" },
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe("Source Already Exists");
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
  });

  test("PUT tags provider metadata when the new URL is a newsletter feed", async () => {
    const source = newSource("user-1");
    jest.mocked(SourcesDataGet).mockResolvedValue(source);
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue({
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.token",
    });
    jest
      .mocked(ProcessorsCheckSource)
      .mockImplementation(async (_span, checkedSource: any) => {
        checkedSource.info.processorPath = "/processors/800-RssProcessor.js";
        return null;
      });

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: {
        name: "Renamed",
        url: "https://newsletter.example/rss/alpha.token",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(source.info.provider).toBe("feedwatcher-newsletter");
    expect(source.info.providerFeedId).toBe("alpha");
    expect(source.info.providerUrl).toBe(
      "https://newsletter.example/rss/alpha.token",
    );
    expect(
      jest.mocked(SourcesDataUpdate).mock.calls[0][1].info.providerFeedId,
    ).toBe("alpha");
  });

  test("PUT drops provider metadata when the new URL is no longer a newsletter feed", async () => {
    const source = newSource("user-1");
    source.info = {
      url: "https://newsletter.example/rss/alpha.token",
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.token",
    };
    jest.mocked(SourcesDataGet).mockResolvedValue(source);
    jest
      .mocked(ProcessorsCheckSource)
      .mockImplementation(async (_span, checkedSource: any) => {
        checkedSource.info.processorPath = "/processors/800-RssProcessor.js";
        return null;
      });

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", url: "https://example.com/other" },
    });

    expect(response.statusCode).toBe(200);
    expect(source.info.provider).toBeUndefined();
    expect(source.info.providerFeedId).toBeUndefined();
    expect(source.info.providerUrl).toBeUndefined();
    expect(source.info.url).toBe("https://example.com/other");
  });

  test("PUT rejects a rotated token matching another newsletter feed by id", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(NewsletterResolveProviderForUrl).mockResolvedValue({
      provider: "feedwatcher-newsletter",
      providerFeedId: "alpha",
      providerUrl: "https://newsletter.example/rss/alpha.rotated",
    });
    jest.mocked(SourcesDataListForUser).mockResolvedValue([
      {
        id: "source-2",
        info: {
          url: "https://newsletter.example/rss/alpha",
          provider: "feedwatcher-newsletter",
          providerFeedId: "alpha",
        },
      },
    ] as any);

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: {
        name: "Renamed",
        url: "https://newsletter.example/rss/alpha.rotated",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
    expect(ProcessorsCheckSource).not.toHaveBeenCalled();
  });


  test("PUT with an empty url returns 400", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", url: "   " },
    });
    expect(response.statusCode).toBe(400);
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
  });

  test("PUT with an unchanged URL keeps the existing name/labels behavior", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataSetSourceLabels).mockResolvedValue(undefined);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: {
        name: "Renamed",
        labels: ["News"],
        url: "https://example.com/feed",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(SourcesDataUpdate).toHaveBeenCalled();
    expect(jest.mocked(SourcesDataUpdate).mock.calls[0][1].name).toBe("Renamed");
    expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
      expect.anything(),
      "source-1",
      ["News"]
    );
  });

  test("DELETE an owned source returns 204", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourcesDataDelete).mockResolvedValue(undefined);
    const response = await fastify.inject({ method: "DELETE", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(204);
    expect(SourcesDataDelete).toHaveBeenCalledWith(
      expect.anything(),
      "source-1"
    );
  });

  test("DELETE an unknown source returns 404", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(null);
    const response = await fastify.inject({ method: "DELETE", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(404);
    expect(SourcesDataDelete).not.toHaveBeenCalled();
  });

  test("GET labels of an owned source returns 200", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataGetSourceLabels).mockResolvedValue([ "News" ] as any);
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1/labels" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ labels: ["News"] });
  });
});
