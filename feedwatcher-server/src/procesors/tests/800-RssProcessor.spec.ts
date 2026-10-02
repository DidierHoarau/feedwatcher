import axios from "axios";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/800-RssProcessor";

jest.mock("axios");

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
  jest.mocked(axios.get).mockResolvedValue({ data: xml } as any);
}

describe("RSS processor fetchLatest (M3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      "network down"
    );
  });

  test("bounds every outbound request with a timeout (M4)", async () => {
    mockFeedResponse(FEED_XML);
    const source = new Source();
    source.info = { url: "https://example.com/feed" };

    await processor.test(source);
    await processor.fetchLatest(source, null);

    expect(axios.get).toHaveBeenCalledWith("https://example.com/feed", {
      timeout: 10000,
    });
  });
});
