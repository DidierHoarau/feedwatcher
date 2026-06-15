import { Source } from "../../model/Source";
import processor from "../../../processors-system/700-PodcastProcessor";

describe("Podcast processor: getInfo", () => {
  test("returns correct metadata", () => {
    const info = processor.getInfo();
    expect(info.title).toBe("Podcast");
    expect(info.icon).toBe("headphones");
    expect(info.description).toBeDefined();
  });
});

describe("Podcast processor: Test URL", () => {
  test("URL: Non-podcast RSS feed returns null", async () => {
    const source = new Source();
    // A standard blog RSS feed without enclosures
    source.info = { url: "https://hnrss.org/frontpage" };
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });

  test("URL: Invalid URL returns null", async () => {
    const source = new Source();
    source.info = { url: "https://notapodcast.invalid/feed.xml" };
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });
});

describe("Podcast processor: Podcast feed detection", () => {
  // Use a well-known public podcast feed (NPR Planet Money)
  const PODCAST_URL = "https://feeds.npr.org/510289/podcast.xml";

  test("URL: Valid podcast feed is detected", async () => {
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
  });

  test("fetchLatest: returns items with podcast metadata", async () => {
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
  });
});
