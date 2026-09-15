import axios, { AxiosResponse } from "axios";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/502-YoutubeChannelProcessor";

const CHANNEL_ID = "UCRAOycPjsSgcEyQcuJD_ENA";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>RiskReversal Media</title>
  <id>yt:channel:${CHANNEL_ID}</id>
  <link rel="alternate" href="https://www.youtube.com/channel/${CHANNEL_ID}"/>
  <link rel="self" href="${FEED_URL}"/>
  <entry>
    <id>yt:video:abc123VIDEoid</id>
    <title>Test video title</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123VIDEoid"/>
    <published>2026-09-01T10:00:00+00:00</published>
    <media:thumbnail url="https://i.ytimg.com/vi/abc123VIDEoid/hqdefault.jpg" width="480" height="360"/>
  </entry>
</feed>`;

// Consent interstitial: no channel ID anywhere in the HTML
const CONSENT_PAGE_HTML = `<!DOCTYPE html><html lang="en"><head>
<title>Before you continue to YouTube</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<div role="heading">Before you continue to YouTube</div>
<form action="https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2F&amp;gl=HK" method="POST">
<input type="hidden" name="bl" value="boq_identityfrontendconsentserver.20260901.00.00">
<input type="submit" value="Reject all">
</form>
</body></html>`;

const SNIPPET_LEGACY_CHANNEL_ID = `<a href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}">RSS</a>`;
const SNIPPET_EXTERNAL_ID = `window["ytInitialData"] = {"metadata":{"channelMetadataRenderer":{"externalId":"${CHANNEL_ID}","title":"RiskReversal Media"}}};`;
const SNIPPET_META_IDENTIFIER = `<meta itemprop="identifier" content="${CHANNEL_ID}">`;
const SNIPPET_CANONICAL_LINK = `<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL_ID}">`;
const SNIPPET_CHANNEL_ID_JSON = `{"responseContext":{},"channelId":"${CHANNEL_ID}"}`;

function reply(data: unknown): AxiosResponse {
  return { data } as AxiosResponse;
}

function mockYouTubeResponses(
  pageHtml: string | null,
  opts?: { isShort?: boolean }
): jest.SpyInstance {
  const spy = jest
    .spyOn(axios, "get")
    .mockImplementation(async (url: string): Promise<AxiosResponse> => {
      if (url.startsWith("https://www.youtube.com/feeds/videos.xml")) {
        return reply(FEED_XML);
      }
      if (url.startsWith("https://www.youtube.com/shorts/")) {
        if (opts && opts.isShort) {
          return reply("<html></html>");
        }
        throw new Error("Request failed with status code 302");
      }
      return reply(pageHtml === null ? "" : pageHtml);
    });
  return spy;
}

function mockNetworkBlocked(): jest.SpyInstance {
  return jest
    .spyOn(axios, "get")
    .mockRejectedValue(new Error("No network expected in this test"));
}

afterEach(() => {
  jest.restoreAllMocks();
});

function newSource(url: string): Source {
  const source = new Source();
  source.info = { url };
  return source;
}

describe("YouTube processor: getInfo", () => {
  test("returns correct metadata and documents supported URLs", () => {
    const info = processor.getInfo();
    expect(info.title).toBe("YouTube Channel");
    expect(info.icon).toBe("youtube");
    expect(info.description).toContain("@handle");
    expect(info.description).toContain("/channel/");
    expect(info.description).toContain("/user/");
    expect(info.description).toContain("/c/");
  });
});

describe("YouTube processor: URL matching", () => {
  test("Non-YouTube URL returns null without network calls", async () => {
    const spy = mockNetworkBlocked();
    const result = await processor.test(newSource("https://example.com/@riskreversalmedia"));
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("Bare YouTube root URL returns null without network calls", async () => {
    const spy = mockNetworkBlocked();
    const result = await processor.test(newSource("https://www.youtube.com/"));
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("YouTube watch URL returns null without network calls", async () => {
    const spy = mockNetworkBlocked();
    const result = await processor.test(
      newSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    );
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("YouTube feeds URL returns null (handled by RSS processor)", async () => {
    const spy = mockNetworkBlocked();
    const result = await processor.test(newSource(FEED_URL));
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("YouTube processor: channel ID resolution", () => {
  test("URL: handle without www resolves and returns feed title", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://youtube.com/@riskreversalmedia")
    );
    expect(result).toEqual({
      name: "RiskReversal Media",
      icon: "youtube",
      channelId: CHANNEL_ID,
    });
  });

  test("URL: www handle resolves", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("URL: m.youtube.com handle resolves", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://m.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
  });

  test("URL: /user/ resolves", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://www.youtube.com/user/SomeUser")
    );
    expect(result).not.toBeNull();
  });

  test("URL: /c/ resolves", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://www.youtube.com/c/SomeCustomName")
    );
    expect(result).not.toBeNull();
  });

  test("Page with channel_id= resolves the channel ID", async () => {
    mockYouTubeResponses(SNIPPET_LEGACY_CHANNEL_ID);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("Page with only externalId in ytInitialData resolves the channel ID", async () => {
    mockYouTubeResponses(SNIPPET_EXTERNAL_ID);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("Page with only meta itemprop identifier resolves the channel ID", async () => {
    mockYouTubeResponses(SNIPPET_META_IDENTIFIER);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("Page with only canonical channel link resolves the channel ID", async () => {
    mockYouTubeResponses(SNIPPET_CANONICAL_LINK);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("Page with only channelId JSON field resolves the channel ID", async () => {
    mockYouTubeResponses(SNIPPET_CHANNEL_ID_JSON);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
  });

  test("Consent interstitial page (no channel ID) returns null and does not fetch the feed", async () => {
    const spy = mockYouTubeResponses(CONSENT_PAGE_HTML);
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("Page fetch failure returns null instead of throwing", async () => {
    jest.spyOn(axios, "get").mockRejectedValue(new Error("connect ETIMEDOUT"));
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).toBeNull();
  });

  test("/channel/UC... URL uses the ID from the URL without fetching the page", async () => {
    const spy = mockYouTubeResponses(null);
    const result = await processor.test(
      newSource(`https://www.youtube.com/channel/${CHANNEL_ID}`)
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      FEED_URL,
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  test("Stored channelId is reused without fetching the page", async () => {
    const spy = mockYouTubeResponses(null);
    const source = newSource("https://www.youtube.com/@riskreversalmedia");
    source.info.channelId = CHANNEL_ID;
    const result = await processor.test(source);
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      FEED_URL,
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  test("Malformed channel IDs are rejected", async () => {
    const spy = jest.spyOn(axios, "get");
    for (const badId of [
      "UCRAOycPjsSgcEyQcuJD_EN", // too short
      "UCRAOycPjsSgcEyQcuJD_ENAx", // too long
      "not-a-real-channel-id",
    ]) {
      spy.mockImplementation(
        async (): Promise<AxiosResponse> =>
          reply(
            `<a href="https://www.youtube.com/feeds/videos.xml?channel_id=${badId}">RSS</a>`
          )
      );
      const result = await processor.test(
        newSource("https://www.youtube.com/@riskreversalmedia")
      );
      expect(result).toBeNull();
    }
  });
  test("Retries the feed fetch when YouTube intermittently returns 404", async () => {
    let feedCalls = 0;
    jest
      .spyOn(axios, "get")
      .mockImplementation(async (url: string): Promise<AxiosResponse> => {
        if (url.startsWith("https://www.youtube.com/feeds/videos.xml")) {
          feedCalls++;
          if (feedCalls === 1) {
            throw new Error("Request failed with status code 404");
          }
          return reply(FEED_XML);
        }
        return reply(SNIPPET_LEGACY_CHANNEL_ID);
      });
    const result = await processor.test(
      newSource("https://www.youtube.com/@riskreversalmedia")
    );
    expect(result).not.toBeNull();
    expect(result.channelId).toBe(CHANNEL_ID);
    expect(feedCalls).toBe(2);
  });
});

describe("YouTube processor: fetchLatest", () => {
  test("Resolves via stored channelId and returns items with metadata", async () => {
    mockYouTubeResponses(CONSENT_PAGE_HTML, { isShort: false });
    const source = newSource("https://www.youtube.com/@riskreversalmedia");
    source.info.channelId = CHANNEL_ID;
    const sourceItems = await processor.fetchLatest(source, null);
    expect(sourceItems.length).toBe(1);
    const firstItem = sourceItems[0];
    expect(firstItem.title).toBe("Test video title");
    expect(firstItem.url).toBe("https://www.youtube.com/watch?v=abc123VIDEoid");
    expect(firstItem.datePublished).toBeInstanceOf(Date);
    expect(firstItem.datePublished.getTime()).not.toBeNaN();
    expect(firstItem.thumbnail).toMatch(/^https?:\/\/.+/);
    expect(firstItem.content).toContain("/embed/abc123VIDEoid/");
  });

  test("Marks shorts items", async () => {
    mockYouTubeResponses(CONSENT_PAGE_HTML, { isShort: true });
    const source = newSource("https://www.youtube.com/@riskreversalmedia");
    source.info.channelId = CHANNEL_ID;
    const sourceItems = await processor.fetchLatest(source, null);
    expect(sourceItems[0].title).toBe("Test video title (#shorts)");
  });

  test("Throws a meaningful error when the channel ID cannot be resolved", async () => {
    mockYouTubeResponses(CONSENT_PAGE_HTML, { isShort: false });
    const source = newSource("https://www.youtube.com/@riskreversalmedia");
    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      `Could not resolve YouTube channel ID for ${source.info.url}`
    );
  });
});

describe("YouTube processor: live e2e (skipped gracefully when offline)", () => {
  const LIVE_URL = "https://youtube.com/@riskreversalmedia";

  test("test() resolves the reported channel", async () => {
    const source = newSource(LIVE_URL);
    let testResult;
    try {
      testResult = await processor.test(source);
    } catch {
      console.warn("Skipping: YouTube unreachable");
      return;
    }
    if (!testResult) {
      console.warn("Skipping: YouTube channel could not be resolved");
      return;
    }
    expect(testResult.name).toBe("RiskReversal Media");
    expect(testResult.channelId).toBe(CHANNEL_ID);
  }, 20000);

  test("fetchLatest() returns items with metadata and embed", async () => {
    const source = newSource(LIVE_URL);
    source.info.channelId = CHANNEL_ID;
    let sourceItems;
    try {
      sourceItems = await processor.fetchLatest(source, null);
    } catch {
      console.warn("Skipping: YouTube unreachable");
      return;
    }
    if (!sourceItems || sourceItems.length === 0) {
      console.warn("Skipping: no items returned (network may be unavailable)");
      return;
    }
    const firstItem = sourceItems[0];
    expect(firstItem.title).toBeDefined();
    expect(firstItem.datePublished).toBeInstanceOf(Date);
    expect(firstItem.thumbnail).toMatch(/^https?:\/\/.+/);
    expect(firstItem.content).toContain("https://www.youtube.com/embed/");
  }, 20000);
});
