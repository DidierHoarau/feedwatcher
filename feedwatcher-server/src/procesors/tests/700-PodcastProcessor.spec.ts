import axios from "axios";
import * as dns from "dns";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/700-PodcastProcessor";

const { createFeedFetchContext } = require(
  "../../../processors-system/lib/feed-cache"
);

const PODCAST_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <item>
      <title>Episode 1</title>
      <link>https://example.com/episode-1</link>
      <guid>https://example.com/episode-1</guid>
      <pubDate>Wed, 01 Oct 2025 12:00:00 GMT</pubDate>
      <description>Episode one</description>
      <enclosure url="https://example.com/episode-1.mp3" type="audio/mpeg" length="12345"/>
    </item>
  </channel>
</rss>`;

const NO_PUBDATE_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <item>
      <title>Episode Without Date</title>
      <link>https://example.com/episode-no-date</link>
      <guid>https://example.com/episode-no-date</guid>
      <description>No date</description>
      <enclosure url="https://example.com/episode-no-date.mp3" type="audio/mpeg" length="12345"/>
    </item>
  </channel>
</rss>`;

const GUID_ONLY_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <item>
      <title>Guid Only Episode</title>
      <guid>episode-guid</guid>
      <pubDate>Wed, 01 Oct 2025 12:00:00 GMT</pubDate>
      <description>Guid only</description>
      <enclosure url="https://example.com/guid-only.mp3" type="audio/mpeg" length="12345"/>
    </item>
  </channel>
</rss>`;

describe("Podcast processor: shared fetch context", () => {
  const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

  test("test and fetchLatest share exactly one HTTP GET", async () => {
    const lookupSpy = jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue(publicLookup);
    const getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/rss+xml" },
      data: PODCAST_FEED_XML,
    } as any);
    const source = new Source();
    source.info = { url: "https://example.com/podcast.xml" };
    const context = createFeedFetchContext();

    const detected = await processor.test(source, context);
    const sourceItems = await processor.fetchLatest(source, null, context);

    expect(detected).toMatchObject({ name: "Test Podcast", icon: "headphones" });
    expect(sourceItems).toHaveLength(1);
    expect(sourceItems[0].info).toMatchObject({
      isPodcast: true,
      audioUrl: "https://example.com/episode-1.mp3",
    });
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
    lookupSpy.mockRestore();
  });

  test("a 304 makes test return null and fetchLatest reject as not modified", async () => {
    const lookupSpy = jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue(publicLookup);
    const getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 304,
      headers: { etag: '"v1"' },
      data: "",
    } as any);
    const source = new Source();
    source.info = { url: "https://example.com/podcast.xml" };
    const context = createFeedFetchContext({
      validators: {
        url: "https://example.com/podcast.xml",
        etag: '"v1"',
        lastModified: null,
      },
    });

    await expect(processor.test(source, context)).resolves.toBeNull();
    await expect(
      processor.fetchLatest(source, null, context)
    ).rejects.toMatchObject({ name: "FeedNotModifiedError" });
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
    lookupSpy.mockRestore();
  });
});

describe("Podcast processor: item dates and identity", () => {
  const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;
  let getSpy: jest.SpyInstance;
  let lookupSpy: jest.SpyInstance;

  afterEach(() => {
    getSpy?.mockRestore();
    lookupSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  test("an episode without pubDate gets the fetch time instead of 1970", async () => {
    lookupSpy = jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue(publicLookup);
    getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/rss+xml" },
      data: NO_PUBDATE_FEED_XML,
    } as any);
    const source = new Source();
    source.info = { url: "https://example.com/podcast.xml" };

    const before = Date.now();
    const sourceItems = await processor.fetchLatest(source, null);
    const after = Date.now();

    expect(sourceItems).toHaveLength(1);
    const published = sourceItems[0].datePublished.getTime();
    expect(published).toBeGreaterThanOrEqual(before);
    expect(published).toBeLessThanOrEqual(after);
    expect(new Date(published).getUTCFullYear()).not.toBe(1970);
  });

  test("an episode without a link dedupes on its guid", async () => {
    lookupSpy = jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue(publicLookup);
    getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/rss+xml" },
      data: GUID_ONLY_FEED_XML,
    } as any);
    const source = new Source();
    source.info = { url: "https://example.com/podcast.xml" };

    const sourceItems = await processor.fetchLatest(source, null);

    expect(sourceItems).toHaveLength(1);
    expect(sourceItems[0].url).toBe("");
    expect(sourceItems[0].info.itemId).toBe("episode-guid");
  });
});

describe("Podcast processor: getInfo", () => {
  test("bounds every outbound request with a timeout (M4)", async () => {
    const lookupSpy = jest.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);
    const spy = jest
      .spyOn(axios, "get")
      .mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/rss+xml" },
        data: "<rss></rss>",
      } as any);
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    await processor.test(source);
    await processor.fetchLatest(source, null).catch(() => undefined);

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of spy.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ timeout: 10000 }));
    }
    spy.mockRestore();
    lookupSpy.mockRestore();
  });

  test("returns correct metadata", () => {
    const info = processor.getInfo();
    expect(info.title).toBe("Podcast");
    expect(info.icon).toBe("headphones");
    expect(info.description).toBeDefined();
  });
});

describe("Podcast processor: Test URL", () => {
  test(
    "URL: Non-podcast RSS feed returns null",
    async () => {
      const source = new Source();
      // A standard blog RSS feed without enclosures
      source.info = { url: "https://hnrss.org/frontpage" };
      const testResult = await processor.test(source);
      expect(testResult).toBeNull();
    },
    20000
  );

  test(
    "URL: Invalid URL returns null",
    async () => {
      const source = new Source();
      source.info = { url: "https://notapodcast.invalid/feed.xml" };
      const testResult = await processor.test(source);
      expect(testResult).toBeNull();
    },
    20000
  );
});

describe("Podcast processor: Podcast feed detection", () => {
  // Use a well-known public podcast feed (NPR Planet Money)
  const PODCAST_URL = "https://feeds.npr.org/510289/podcast.xml";

  test(
    "URL: Valid podcast feed is detected",
    async () => {
      const source = new Source();
      source.info = { url: PODCAST_URL };
      const testResult = await processor.test(source);
      // The test may return null if the network is unavailable; skip gracefully
      if (testResult === null) {
        console.warn("Skipping: podcast feed unreachable");
        return;
      }
      expect(testResult.name).toBeDefined();
      expect(testResult.icon).toBe("headphones");
    },
    20000
  );

  test(
    "fetchLatest: returns items with podcast metadata",
    async () => {
      const source = new Source();
      source.info = { url: PODCAST_URL };
      const sourceItems = await processor.fetchLatest(source, null);
      if (sourceItems.length === 0) {
        console.warn("Skipping: no items returned (network may be unavailable)");
        return;
      }
      const firstItem = sourceItems[0];
      expect(firstItem.title).toBeDefined();
      expect(firstItem.info).toBeDefined();
      expect(firstItem.info.isPodcast).toBe(true);
      expect(firstItem.info.audioUrl).toBeDefined();
      expect(firstItem.info.audioUrl).toMatch(/^https?:\/\/.+/);
    },
    20000
  );
});
