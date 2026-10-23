import axios from "axios";
import * as dns from "dns";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/800-RssProcessor";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Item A</title>
      <link>https://example.com/a</link>
      <guid>https://example.com/a</guid>
      <pubDate>Wed, 01 Oct 2025 12:00:00 GMT</pubDate>
      <description>A</description>
    </item>
    <item>
      <title>Item B</title>
      <guid>https://example.com/b</guid>
      <description>B</description>
    </item>
    <item>
      <title>Item C</title>
      <description>C</description>
    </item>
    <item>
      <title>Item D</title>
      <link>https://example.com/d</link>
      <description>D</description>
    </item>
  </channel>
</rss>`;

function mockFeedResponse(xml: string): void {
  jest.mocked(axios.get).mockResolvedValue({
    status: 200,
    headers: { "content-type": "application/rss+xml" },
    data: xml,
  } as any);
}

describe("RSS processor fetchLatest (M3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("falls back to the guid, skips url-less items and avoids epoch dates", async () => {
    mockFeedResponse(FEED_XML);
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    const before = Date.now();
    const sourceItems = await processor.fetchLatest(source, null);
    const after = Date.now();

    expect(sourceItems).toHaveLength(3);
    expect(sourceItems.map((item: any) => item.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/d",
    ]);

    const itemA = sourceItems[0] as any;
    expect(new Date(itemA.datePublished).toISOString()).toBe(
      "2025-10-01T12:00:00.000Z"
    );

    const itemB = sourceItems[1] as any;
    const itemD = sourceItems[2] as any;
    for (const item of [itemB, itemD]) {
      const dateMs = new Date(item.datePublished).getTime();
      expect(dateMs).toBeGreaterThanOrEqual(before);
      expect(dateMs).toBeLessThanOrEqual(after);
    }
  });

  test("rejects a feed that fails to parse without crashing the processor", async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error("network down"));
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      "Failed to fetch URL"
    );
  });

  test("bounds every outbound request with a timeout (M4)", async () => {
    mockFeedResponse(FEED_XML);
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    await processor.test(source);
    await processor.fetchLatest(source, null);

    expect(axios.get).toHaveBeenCalledWith(
      "https://example.com/feed",
      expect.objectContaining({ timeout: 10000 })
    );
  });
});

describe("RSS processor SSRF protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test.each([
    "http://127.0.0.1/feed",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/feed",
    "file:///etc/passwd",
  ])("does not fetch %s (test returns null)", async (url) => {
    const source = new Source();
    source.info = { url };

    await expect(processor.test(source)).resolves.toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("does not fetch a private hostname and rejects fetchLatest", async () => {
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any);
    const source = new Source();
    source.info = { url: "http://internal.example/feed" };

    await expect(processor.test(source)).resolves.toBeNull();
    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      "URL not allowed"
    );
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a feed redirecting to a private address", async () => {
    jest.mocked(axios.get).mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://127.0.0.1/feed" },
      data: "",
    } as any);
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      "URL not allowed"
    );
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
