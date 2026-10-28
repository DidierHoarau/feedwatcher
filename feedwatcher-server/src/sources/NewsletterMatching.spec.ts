import {
  newsletterCatalogueStates,
  newsletterFeedIdFromUrl,
  newsletterFindSourceIds,
} from "./NewsletterMatching";
import { NewsletterFeed, NEWSLETTER_PROVIDER } from "./NewsletterClient";

function feed(overrides: Partial<NewsletterFeed> = {}): NewsletterFeed {
  return {
    providerFeedId: "morningbrew",
    title: "Morning Brew",
    senderName: "Morning Brew",
    senderEmail: "news@morningbrew.com",
    itemCount: 12,
    latestDate: "2026-10-27T06:00:00.000Z",
    feedUrl: "https://newsletter.example/rss/morningbrew",
    ...overrides,
  };
}

describe("newsletterFeedIdFromUrl", () => {
  test("parses a bare feed id", () => {
    expect(
      newsletterFeedIdFromUrl("https://newsletter.example/rss/morningbrew"),
    ).toBe("morningbrew");
  });

  test("strips a dotted token suffix", () => {
    expect(
      newsletterFeedIdFromUrl(
        "https://newsletter.example/rss/morningbrew.0123456789abcdef",
      ),
    ).toBe("morningbrew");
  });

  test("ignores a trailing slash and query string", () => {
    expect(
      newsletterFeedIdFromUrl(
        "https://newsletter.example/rss/morningbrew.abc/?utm=1",
      ),
    ).toBe("morningbrew");
  });

  test("decodes percent-encoded ids", () => {
    expect(
      newsletterFeedIdFromUrl("https://newsletter.example/rss/morning%20brew"),
    ).toBe("morning brew");
  });

  test("is independent of host and port", () => {
    expect(
      newsletterFeedIdFromUrl("http://other-host:8080/rss/morningbrew"),
    ).toBe("morningbrew");
  });

  test("rejects non-/rss/ paths", () => {
    expect(
      newsletterFeedIdFromUrl("https://newsletter.example/feed/morningbrew"),
    ).toBeNull();
    expect(newsletterFeedIdFromUrl("https://newsletter.example/rss")).toBeNull();
    expect(
      newsletterFeedIdFromUrl("https://newsletter.example/rss/morningbrew/extra"),
    ).toBeNull();
  });

  test("rejects empty and malformed urls", () => {
    expect(newsletterFeedIdFromUrl("")).toBeNull();
    expect(newsletterFeedIdFromUrl("not a url")).toBeNull();
    expect(newsletterFeedIdFromUrl(null as any)).toBeNull();
    expect(newsletterFeedIdFromUrl("https://newsletter.example/rss/")).toBeNull();
  });

  test("rejects ids longer than 128 characters", () => {
    expect(
      newsletterFeedIdFromUrl(
        `https://newsletter.example/rss/${"a".repeat(129)}`,
      ),
    ).toBeNull();
  });
});

describe("newsletterFindSourceIds", () => {
  const catalogue = new Set(["morningbrew", "techdigest"]);

  test("matches through the provider metadata", () => {
    const sources = [
      {
        id: "source-1",
        info: {
          url: "https://newsletter.example/rss/totally-different",
          provider: NEWSLETTER_PROVIDER,
          providerFeedId: "morningbrew",
        },
      },
    ];
    const found = newsletterFindSourceIds(sources, catalogue);
    expect(found.get("morningbrew")).toBe("source-1");
  });

  test("matches a legacy bare-id url", () => {
    const sources = [
      {
        id: "source-2",
        info: { url: "https://newsletter.example/rss/morningbrew" },
      },
    ];
    expect(newsletterFindSourceIds(sources, catalogue).get("morningbrew")).toBe(
      "source-2",
    );
  });

  test("matches a legacy tokenised url", () => {
    const sources = [
      {
        id: "source-3",
        info: { url: "https://newsletter.example/rss/techdigest.deadbeef" },
      },
    ];
    expect(newsletterFindSourceIds(sources, catalogue).get("techdigest")).toBe(
      "source-3",
    );
  });

  test("never matches ids the catalogue does not offer", () => {
    const sources = [
      {
        id: "source-4",
        info: { url: "https://newsletter.example/rss/someone-else" },
      },
      {
        id: "source-5",
        info: { url: "https://example.com/feed.xml" },
      },
    ];
    const found = newsletterFindSourceIds(sources, catalogue);
    expect(found.size).toBe(0);
  });

  test("primary metadata wins over a legacy url in another source", () => {
    const sources = [
      {
        id: "legacy",
        info: { url: "https://newsletter.example/rss/morningbrew" },
      },
      {
        id: "primary",
        info: {
          url: "https://newsletter.example/rss/morningbrew.token",
          provider: NEWSLETTER_PROVIDER,
          providerFeedId: "morningbrew",
        },
      },
    ];
    expect(newsletterFindSourceIds(sources, catalogue).get("morningbrew")).toBe(
      "primary",
    );
  });

  test("a provider-tagged source does not double as a legacy match", () => {
    const sources = [
      {
        id: "primary",
        info: {
          url: "https://newsletter.example/rss/techdigest",
          provider: NEWSLETTER_PROVIDER,
          providerFeedId: "morningbrew",
        },
      },
    ];
    const found = newsletterFindSourceIds(sources, catalogue);
    expect(found.get("morningbrew")).toBe("primary");
    expect(found.has("techdigest")).toBe(false);
  });
});

describe("newsletterCatalogueStates", () => {
  test("overlays added, ignored and available with added winning", () => {
    const feeds = [
      feed({ providerFeedId: "added" }),
      feed({ providerFeedId: "ignored" }),
      feed({ providerFeedId: "available" }),
      feed({ providerFeedId: "added-and-ignored" }),
    ];
    const states = newsletterCatalogueStates(
      feeds,
      new Map([
        ["added", "source-1"],
        ["added-and-ignored", "source-2"],
      ]),
      new Set(["ignored", "added-and-ignored"]),
    );
    expect(states.map((entry) => entry.state)).toEqual([
      "added",
      "ignored",
      "available",
      "added",
    ]);
    expect(states[0].existingSourceId).toBe("source-1");
    expect(states[3].existingSourceId).toBe("source-2");
    expect(states[1].existingSourceId).toBeUndefined();
    expect(states[2].existingSourceId).toBeUndefined();
  });

  test("preserves catalogue fields and ordering", () => {
    const feeds = [feed({ providerFeedId: "a" }), feed({ providerFeedId: "b" })];
    const states = newsletterCatalogueStates(feeds, new Map(), new Set());
    expect(states.map((entry) => entry.providerFeedId)).toEqual(["a", "b"]);
    expect(states[0].itemCount).toBe(12);
    expect(states[0].latestDate).toBe("2026-10-27T06:00:00.000Z");
  });
});
