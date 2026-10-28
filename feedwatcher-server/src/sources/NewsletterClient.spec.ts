import axios from "axios";
import { ConfigGet } from "../Config";
import {
  NewsletterGetFeeds,
  NewsletterError,
  NewsletterResetCacheForTests,
} from "./NewsletterClient";

jest.mock("axios");

jest.mock("../Config", () => ({
  ConfigGet: jest.fn(),
}));

jest.mock("../OTelContext", () => ({
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

const BASE_URL = "https://newsletter.example";

function configure(overrides: any = {}) {
  jest.mocked(ConfigGet).mockReturnValue({
    NEWSLETTER_URL: `${BASE_URL}/`,
    NEWSLETTER_AUTH_USERNAME: "feedwatcher",
    NEWSLETTER_AUTH_PASSWORD: "",
    ...overrides,
  } as any);
}

function catalogueResponse(overrides: any = {}) {
  return {
    status: 200,
    headers: {
      etag: '"catalogue-v1"',
      "last-modified": "Tue, 27 Oct 2026 06:00:00 GMT",
    },
    data: {
      version: 1,
      feeds: [
        {
          feedId: "techdigest",
          title: "Tech Digest",
          senderName: "Tech Digest",
          senderEmail: "tech@example.com",
          itemCount: 3,
          latestDate: "2026-10-27T05:00:00.000Z",
          feedUrl: `${BASE_URL}/rss/techdigest.token`,
        },
        {
          feedId: "morningbrew",
          title: "Morning Brew",
          senderName: "Morning Brew",
          senderEmail: "news@morningbrew.com",
          itemCount: 12,
          latestDate: "2026-10-27T06:00:00.000Z",
          feedUrl: `${BASE_URL}/rss/morningbrew`,
        },
      ],
    },
    ...overrides,
  };
}

function legacyResponse(feeds: any[], overrides: any = {}) {
  return {
    status: 200,
    headers: {},
    data: feeds,
    ...overrides,
  };
}

const LEGACY_FEEDS = [
  {
    id: "morningbrew",
    feedId: "morningbrew",
    title: "Morning Brew",
    senderName: "Morning Brew",
    senderEmail: "news@morningbrew.com",
    itemCount: 4,
    latestDate: "2026-10-27T06:00:00.000Z",
    feedUrl: `${BASE_URL}/rss/morningbrew.token`,
  },
];

describe("NewsletterClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NewsletterResetCacheForTests();
    configure();
  });

  test("maps the v1 catalogue in its published order", async () => {
    jest.mocked(axios.get).mockResolvedValue(catalogueResponse() as any);

    const feeds = await NewsletterGetFeeds();

    expect(feeds).toEqual([
      {
        providerFeedId: "techdigest",
        title: "Tech Digest",
        senderName: "Tech Digest",
        senderEmail: "tech@example.com",
        itemCount: 3,
        latestDate: "2026-10-27T05:00:00.000Z",
        feedUrl: `${BASE_URL}/rss/techdigest.token`,
      },
      {
        providerFeedId: "morningbrew",
        title: "Morning Brew",
        senderName: "Morning Brew",
        senderEmail: "news@morningbrew.com",
        itemCount: 12,
        latestDate: "2026-10-27T06:00:00.000Z",
        feedUrl: `${BASE_URL}/rss/morningbrew`,
      },
    ]);
    expect(jest.mocked(axios.get)).toHaveBeenCalledWith(
      `${BASE_URL}/api/feeds`,
      expect.objectContaining({
        timeout: 5000,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
        maxRedirects: 0,
      }),
    );
  });

  test("reports an invalid response when neither endpoint is usable", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { version: 2 } } as any)
      .mockResolvedValueOnce(legacyResponse({ not: "an array" } as any));

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_invalid_response",
      statusCode: 502,
    });
  });

  test("rejects a catalogue entry with credentials in the feed url", async () => {
    const invalid = catalogueResponse();
    invalid.data.feeds[0].feedUrl = "https://user:pass@newsletter.example/rss/x";
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce(invalid as any)
      .mockResolvedValueOnce(legacyResponse({ not: "an array" } as any));

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_invalid_response",
    });
  });

  test("revalidates with the ETag and serves the cache on 304", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce(catalogueResponse() as any)
      .mockResolvedValueOnce({ status: 304, headers: {}, data: "" } as any);

    const first = await NewsletterGetFeeds();
    const second = await NewsletterGetFeeds({ force: true });

    expect(second).toEqual(first);
    const secondCall = jest.mocked(axios.get).mock.calls[1];
    expect(secondCall[1].headers["If-None-Match"]).toBe('"catalogue-v1"');
    expect(secondCall[1].headers["If-Modified-Since"]).toBe(
      "Tue, 27 Oct 2026 06:00:00 GMT",
    );
  });

  test("serves the in-memory cache within the TTL", async () => {
    jest.mocked(axios.get).mockResolvedValue(catalogueResponse() as any);

    await NewsletterGetFeeds();
    await NewsletterGetFeeds();

    expect(jest.mocked(axios.get)).toHaveBeenCalledTimes(1);
  });

  test("falls back to the legacy JSON list when /api/feeds is missing", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({ status: 404, headers: {}, data: "" } as any)
      .mockResolvedValueOnce(legacyResponse(LEGACY_FEEDS));

    const feeds = await NewsletterGetFeeds();

    expect(feeds).toEqual([
      {
        providerFeedId: "morningbrew",
        title: "Morning Brew",
        senderName: "Morning Brew",
        senderEmail: "news@morningbrew.com",
        itemCount: 4,
        latestDate: "2026-10-27T06:00:00.000Z",
        feedUrl: `${BASE_URL}/rss/morningbrew.token`,
      },
    ]);
    expect(jest.mocked(axios.get).mock.calls[1][0]).toBe(`${BASE_URL}/rss/`);
    expect(jest.mocked(axios.get).mock.calls[1][1].headers.Accept).toBe(
      "application/json",
    );
  });

  test("fills legacy defaults for sparse entries", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({ status: 503, headers: {}, data: "" } as any)
      .mockResolvedValueOnce(
        legacyResponse([
          {
            feedId: "morningbrew",
            senderName: "Morning Brew",
            feedUrl: `${BASE_URL}/rss/morningbrew`,
          },
        ]),
      );

    const feeds = await NewsletterGetFeeds();

    expect(feeds[0]).toMatchObject({
      providerFeedId: "morningbrew",
      title: "Morning Brew",
      senderName: "Morning Brew",
      senderEmail: "",
      itemCount: 0,
      latestDate: null,
    });
  });

  test("does not fall back on 401 and reports an auth failure", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({ status: 401, headers: {}, data: "" } as any);

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_auth_failed",
      statusCode: 502,
    });
    expect(jest.mocked(axios.get)).toHaveBeenCalledTimes(1);
  });

  test("reports a timeout when both endpoints time out", async () => {
    jest.mocked(axios.get).mockRejectedValue({ code: "ECONNABORTED" });

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_timeout",
      statusCode: 504,
    });
  });

  test("reports unreachable when both endpoints fail on the network", async () => {
    jest.mocked(axios.get).mockRejectedValue({ code: "ENOTFOUND" });

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_unreachable",
      statusCode: 502,
    });
  });

  test("only sends Basic credentials when a password is configured", async () => {
    jest.mocked(axios.get).mockResolvedValue(catalogueResponse() as any);
    await NewsletterGetFeeds();
    expect(
      jest.mocked(axios.get).mock.calls[0][1].headers.Authorization,
    ).toBeUndefined();

    NewsletterResetCacheForTests();
    configure({
      NEWSLETTER_AUTH_USERNAME: "reader",
      NEWSLETTER_AUTH_PASSWORD: "secret",
    });
    await NewsletterGetFeeds();
    const authorization =
      jest.mocked(axios.get).mock.calls[1][1].headers.Authorization;
    expect(authorization).toBe(
      `Basic ${Buffer.from("reader:secret").toString("base64")}`,
    );
  });

  test("reports the integration as disabled when no URL is configured", async () => {
    configure({ NEWSLETTER_URL: "" });

    await expect(NewsletterGetFeeds()).rejects.toMatchObject({
      code: "newsletter_disabled",
      statusCode: 503,
    });
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled();
  });

  test("safe error messages never contain the configured URL", async () => {
    jest.mocked(axios.get).mockRejectedValue({ code: "ENOTFOUND" });

    let caught: NewsletterError = null;
    try {
      await NewsletterGetFeeds();
    } catch (err) {
      caught = err as NewsletterError;
    }
    expect(caught).toBeInstanceOf(NewsletterError);
    expect(caught.message).not.toContain(BASE_URL);
    expect(caught.message).not.toContain("newsletter.example");
  });
});
