import axios from "axios";
import * as dns from "dns";

const { createFeedFetchContext, FeedNotModifiedError } = require(
  "../../../processors-system/lib/feed-cache"
);
const ssrfHttp = require("../../../processors-system/lib/ssrf-http");

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

jest.mock("@rowanmanning/feed-parser", () => ({
  parseFeed: jest.fn((xml: string) => ({
    title: "Parsed Feed",
    items: [],
    raw: xml,
  })),
}));

const { parseFeed } = require("@rowanmanning/feed-parser");

const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

function response(status: number, headers: any = {}, data = "") {
  return { status, headers, data } as any;
}

describe("feed-cache createFeedFetchContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ssrfHttp.configure({ allowPrivateNetwork: false });
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("fetches and parses one URL once per context", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));

    const context = createFeedFetchContext();
    const first = await context.getFeed("https://example.com/feed");
    const second = await context.getFeed("https://example.com/feed");

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(parseFeed).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(context.getUpdatedState()).toEqual({
      url: "https://example.com/feed",
      etag: null,
      lastModified: null,
    });
  });

  test("sends conditional headers only for the validators' URL", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));
    const context = createFeedFetchContext({
      validators: {
        url: "https://example.com/feed",
        etag: '"v1"',
        lastModified: "Wed, 01 Oct 2025 12:00:00 GMT",
      },
    });

    await context.getFeed("https://example.com/other");
    const otherOptions = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(otherOptions.headers["If-None-Match"]).toBeUndefined();
    expect(otherOptions.headers["If-Modified-Since"]).toBeUndefined();

    await context.getFeed("https://example.com/feed");
    const feedOptions = jest.mocked(axios.get).mock.calls[1][1] as any;
    expect(feedOptions.headers["If-None-Match"]).toBe('"v1"');
    expect(feedOptions.headers["If-Modified-Since"]).toBe(
      "Wed, 01 Oct 2025 12:00:00 GMT"
    );
  });

  test("treats a 304 as not-modified without parsing and keeps new validators", async () => {
    jest.mocked(axios.get).mockResolvedValue(
      response(304, { etag: '"v2"' }, "not a feed")
    );
    const context = createFeedFetchContext({
      validators: {
        url: "https://example.com/feed",
        etag: '"v1"',
        lastModified: null,
      },
    });

    await expect(
      context.getFeed("https://example.com/feed")
    ).rejects.toMatchObject({ name: "FeedNotModifiedError", statusCode: 304 });
    expect(parseFeed).not.toHaveBeenCalled();
    expect(context.isNotModified("https://example.com/feed")).toBe(true);
    expect(context.getUpdatedState()).toEqual({
      url: "https://example.com/feed",
      etag: '"v2"',
      lastModified: null,
    });

    // The 304 outcome is cached too: no second request, no parsing.
    await expect(
      context.getFeed("https://example.com/feed")
    ).rejects.toBeInstanceOf(FeedNotModifiedError);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test("keeps the previous state when a 304 carries no validators", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(304, {}, ""));
    const context = createFeedFetchContext({
      validators: {
        url: "https://example.com/feed",
        etag: '"v1"',
        lastModified: null,
      },
    });

    await expect(
      context.getFeed("https://example.com/feed")
    ).rejects.toBeInstanceOf(FeedNotModifiedError);
    expect(context.getUpdatedState()).toBeNull();
  });

  test("caches rejected fetches per URL", async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error("network down"));
    const context = createFeedFetchContext();

    await expect(
      context.getFeed("https://example.com/feed")
    ).rejects.toThrow("Failed to fetch URL");
    await expect(
      context.getFeed("https://example.com/feed")
    ).rejects.toThrow("Failed to fetch URL");
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(context.isNotModified("https://example.com/feed")).toBe(false);
  });

  test("forwards the fetch options and abort signal to ssrf-http", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));
    const controller = new AbortController();
    const context = createFeedFetchContext({ signal: controller.signal });

    await context.getFeed("https://example.com/feed", {
      timeoutMs: 1234,
      maxContentLength: 5678,
    });

    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.timeout).toBe(1234);
    expect(options.maxContentLength).toBe(5678);
    expect(options.signal).toBe(controller.signal);
  });

  test("returns validators from a 200 and clears a vanished ETag", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce(
        response(200, { etag: '"v1"', "last-modified": "date-1" }, "<rss/>")
      )
      .mockResolvedValueOnce(response(200, {}, "<rss/>"));
    const context = createFeedFetchContext();

    await context.getFeed("https://example.com/feed");
    expect(context.getUpdatedState()).toEqual({
      url: "https://example.com/feed",
      etag: '"v1"',
      lastModified: "date-1",
    });

    const secondContext = createFeedFetchContext();
    await secondContext.getFeed("https://example.com/feed");
    expect(secondContext.getUpdatedState()).toEqual({
      url: "https://example.com/feed",
      etag: null,
      lastModified: null,
    });
  });
});

describe("feed-cache newsletter rewrite", () => {
  const INTERNAL =
    "http://feedwatcher-newsletter.feedwatcher.svc.cluster.local:8080";
  const ADVERTISED = "https://newsletter.example/rss/morningbrew.0123456789abcdef";
  const TRUSTED = [INTERNAL, "https://newsletter.example"];

  function newsletterContext(validators: any = null) {
    return createFeedFetchContext({
      validators,
      trustedOrigins: TRUSTED,
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
      rewriteBase: INTERNAL,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ssrfHttp.configure({ allowPrivateNetwork: false });
    jest.mocked(dns.promises.lookup).mockImplementation(
      async (hostname: string) =>
        String(hostname).includes("feedwatcher-newsletter")
          ? ([{ address: "10.0.0.5", family: 4 }] as any)
          : publicLookup
    );
  });

  test("rewrites a trusted advertised URL to the internal base", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));

    const context = newsletterContext();
    await context.getFeed(ADVERTISED);

    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      `${INTERNAL}/rss/morningbrew.0123456789abcdef`
    );
    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.headers.Authorization).toBe("Basic dXNlcjpwYXNz");
    // The private internal host was accepted because it is a trusted origin.
    expect(dns.promises.lookup).toHaveBeenCalledWith(
      "feedwatcher-newsletter.feedwatcher.svc.cluster.local",
      { all: true }
    );
    expect(context.getUpdatedState().url).toBe(ADVERTISED);
  });

  test("does not rewrite an origin outside the trusted list", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));

    const context = newsletterContext();
    await context.getFeed("https://example.com/feed");

    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      "https://example.com/feed"
    );
  });

  test("keys conditional headers on the advertised URL while fetching the rewrite", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));

    const context = newsletterContext({
      url: ADVERTISED,
      etag: '"v1"',
      lastModified: "Wed, 01 Oct 2025 12:00:00 GMT",
    });
    await context.getFeed(ADVERTISED);

    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      `${INTERNAL}/rss/morningbrew.0123456789abcdef`
    );
    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.headers["If-None-Match"]).toBe('"v1"');
    expect(options.headers["If-Modified-Since"]).toBe(
      "Wed, 01 Oct 2025 12:00:00 GMT"
    );
  });

  test("keeps the advertised URL in state after a 304 and hides the token", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValue(response(304, { etag: '"v2"' }, ""));

    const context = newsletterContext({
      url: ADVERTISED,
      etag: '"v1"',
      lastModified: null,
    });
    await expect(context.getFeed(ADVERTISED)).rejects.toMatchObject({
      name: "FeedNotModifiedError",
      message: "Feed not modified",
    });
    expect(context.isNotModified(ADVERTISED)).toBe(true);
    expect(context.getUpdatedState()).toEqual({
      url: ADVERTISED,
      etag: '"v2"',
      lastModified: null,
    });

    const error = await context.getFeed(ADVERTISED).catch((err) => err);
    expect(error.message).not.toContain("0123456789abcdef");
  });

  test("keeps the default behaviour without newsletter options", async () => {
    jest.mocked(axios.get).mockResolvedValue(response(200, {}, "<rss/>"));

    const context = createFeedFetchContext();
    await context.getFeed("https://example.com/feed");

    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      "https://example.com/feed"
    );
    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers["User-Agent"]).toContain("FeedWatcher");
  });
});
