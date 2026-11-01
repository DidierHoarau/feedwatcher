import { ConfigGet } from "../Config";
import { Source } from "../model/Source";
import { NEWSLETTER_PROVIDER, NewsletterGetFeeds } from "./NewsletterClient";
import {
  NewsletterAutoRepair,
  NewsletterBackfillProviders,
  NewsletterMatchExistingSourceByUrl,
  NewsletterRepairProviderSources,
  NewsletterResetAutoRepairForTests,
  NewsletterResetCatalogueIndexForTests,
  NewsletterResolveProviderForUrl,
} from "./NewsletterProvider";
import {
  SourcesDataListAll,
  SourcesDataListForUser,
  SourcesDataUpdate,
} from "./SourcesData";
import { SourcesFetchStateDataDelete } from "./SourcesFetchStateData";

jest.mock("../OTelContext", () => ({
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

jest.mock("./NewsletterClient", () => ({
  NEWSLETTER_PROVIDER: "feedwatcher-newsletter",
  NewsletterGetFeeds: jest.fn(),
  NewsletterError: class NewsletterError extends Error {},
}));

jest.mock("./SourcesData", () => ({
  SourcesDataListAll: jest.fn(),
  SourcesDataListForUser: jest.fn(),
  SourcesDataUpdate: jest.fn(),
}));

jest.mock("./SourcesFetchStateData", () => ({
  SourcesFetchStateDataDelete: jest.fn(),
}));

const INTERNAL =
  "http://feedwatcher-newsletter.feedwatcher.svc.cluster.local:8080";
const PUBLIC_ORIGIN = "https://newsletter.example";

function catalogue(feedId: string, feedUrl: string) {
  return {
    providerFeedId: feedId,
    title: `${feedId} title`,
    senderName: `${feedId} sender`,
    senderEmail: `${feedId}@example.com`,
    itemCount: 3,
    latestDate: null,
    feedUrl,
  };
}

function newSource(id: string, info: any): Source {
  const source = new Source();
  source.id = id;
  source.name = `name-${id}`;
  source.userId = "user-1";
  source.info = info;
  return source;
}

describe("NewsletterProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NewsletterResetAutoRepairForTests();
    NewsletterResetCatalogueIndexForTests();
    jest.mocked(ConfigGet).mockReturnValue({
      NEWSLETTER_URL: INTERNAL,
    } as any);
    jest.mocked(SourcesDataUpdate).mockResolvedValue(undefined);
    jest.mocked(SourcesFetchStateDataDelete).mockResolvedValue(undefined);
    jest.mocked(SourcesDataListAll).mockResolvedValue([]);
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);
    jest
      .mocked(NewsletterGetFeeds)
      .mockResolvedValue([
        catalogue("morningbrew", `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`),
      ] as any);
  });

  describe("NewsletterResolveProviderForUrl", () => {
    test("resolves the internal origin without reading the catalogue", async () => {
      const meta = await NewsletterResolveProviderForUrl(
        `${INTERNAL}/rss/morningbrew.aaaa`
      );
      expect(meta).toEqual({
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${INTERNAL}/rss/morningbrew.aaaa`,
      });
      expect(NewsletterGetFeeds).not.toHaveBeenCalled();
    });

    test("resolves a catalogue feed to its advertised URL", async () => {
      const meta = await NewsletterResolveProviderForUrl(
        `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`
      );
      expect(meta).toEqual({
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
      });
    });

    test("keeps an unknown feed id on a known catalogue origin", async () => {
      const meta = await NewsletterResolveProviderForUrl(
        `${PUBLIC_ORIGIN}/rss/vanished.aaaa`
      );
      expect(meta).toEqual({
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "vanished",
        providerUrl: `${PUBLIC_ORIGIN}/rss/vanished.aaaa`,
      });
    });

    test("returns null for a foreign origin, a non-/rss/ path or a disabled integration", async () => {
      expect(
        await NewsletterResolveProviderForUrl(
          "https://elsewhere.example/rss/morningbrew"
        )
      ).toBeNull();
      expect(
        await NewsletterResolveProviderForUrl(`${PUBLIC_ORIGIN}/feed/1`)
      ).toBeNull();
      const catalogueCalls = jest.mocked(NewsletterGetFeeds).mock.calls.length;
      jest
        .mocked(ConfigGet)
        .mockReturnValue({ NEWSLETTER_URL: "" } as any);
      expect(
        await NewsletterResolveProviderForUrl(`${INTERNAL}/rss/morningbrew`)
      ).toBeNull();
      expect(NewsletterGetFeeds).toHaveBeenCalledTimes(catalogueCalls);
    });

    test("returns null when the catalogue is unavailable", async () => {
      jest.mocked(NewsletterGetFeeds).mockRejectedValueOnce(
        new NewsletterError("newsletter_unreachable", 502, "down")
      );
      expect(
        await NewsletterResolveProviderForUrl(
          `${PUBLIC_ORIGIN}/rss/morningbrew`
        )
      ).toBeNull();
    });
  });

  describe("NewsletterBackfillProviders", () => {
    test("tags an internal-origin legacy source idempotently", async () => {
      const source = newSource("s1", {
        url: `${INTERNAL}/rss/morningbrew.aaaa`,
      });
      jest.mocked(SourcesDataListAll).mockResolvedValue([source]);

      const first = await NewsletterBackfillProviders({} as any, {
        useCatalogue: false,
      });
      expect(first).toEqual({ scanned: 1, tagged: 1 });
      expect(source.info).toMatchObject({
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${INTERNAL}/rss/morningbrew.aaaa`,
      });
      expect(SourcesDataUpdate).toHaveBeenCalledTimes(1);

      const second = await NewsletterBackfillProviders({} as any, {
        useCatalogue: false,
      });
      expect(second.tagged).toBe(0);
      expect(SourcesDataUpdate).toHaveBeenCalledTimes(1);
    });

    test("never tags a foreign origin", async () => {
      const source = newSource("s1", {
        url: "https://elsewhere.example/rss/morningbrew",
      });
      jest.mocked(SourcesDataListAll).mockResolvedValue([source]);
      await NewsletterBackfillProviders({} as any, { useCatalogue: true });
      expect(source.info.provider).toBeUndefined();
      expect(SourcesDataUpdate).not.toHaveBeenCalled();
    });

    test("tags a public-origin source only with catalogue verification", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.old`,
      });
      jest.mocked(SourcesDataListAll).mockResolvedValue([source]);

      await NewsletterBackfillProviders({} as any, { useCatalogue: false });
      expect(source.info.provider).toBeUndefined();

      const result = await NewsletterBackfillProviders({} as any, {
        useCatalogue: true,
      });
      expect(result.tagged).toBe(1);
      expect(source.info.provider).toBe(NEWSLETTER_PROVIDER);
    });

    test("tags a user-scoped list and reports counts only", async () => {
      const source = newSource("s1", {
        url: `${INTERNAL}/rss/morningbrew`,
      });
      jest.mocked(SourcesDataListForUser).mockResolvedValue([source]);
      const result = await NewsletterBackfillProviders({} as any, {
        useCatalogue: false,
        userId: "user-1",
      });
      expect(result).toEqual({ scanned: 1, tagged: 1 });
      expect(SourcesDataListForUser).toHaveBeenCalledWith(
        expect.anything(),
        "user-1"
      );
    });
  });

  describe("NewsletterRepairProviderSources", () => {
    test("repairs a rotated token in place, keeping id, name and labels", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
        fetchErrorCount: 3,
        autoDisabled: true,
        autoDisabledDate: new Date(),
        autoDisabledReason: "boom",
        retryAfterUntil: new Date(),
        lastFetchError: "Failed to fetch URL (HTTP 404)",
        lastFetchErrorDate: new Date(),
        lastFetchErrorStatus: 404,
        lastFetchErrorClass: "permanent",
        lastAttemptDate: new Date(),
      });
      source.labels = ["Newsletters"];

      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: false,
        sources: [source],
      });

      expect(report).toMatchObject({
        dryRun: false,
        catalogueAvailable: true,
        backfilled: 0,
        unchanged: 0,
        unverified: 0,
      });
      expect(report.repaired).toEqual([
        { sourceId: "s1", sourceName: "name-s1", feedId: "morningbrew" },
      ]);
      expect(source.id).toBe("s1");
      expect(source.name).toBe("name-s1");
      expect(source.labels).toEqual(["Newsletters"]);
      expect(source.info.url).toBe(`${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`);
      expect(source.info.providerUrl).toBe(
        `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`
      );
      expect(source.info.fetchErrorCount).toBeUndefined();
      expect(source.info.autoDisabled).toBeUndefined();
      expect(source.info.lastFetchError).toBeUndefined();
      expect(source.info.lastAttemptDate).toBeUndefined();
      expect(SourcesFetchStateDataDelete).toHaveBeenCalledWith(
        expect.anything(),
        "s1"
      );
      expect(SourcesDataUpdate).toHaveBeenCalledTimes(1);
    });

    test("plans without writing on a dry run", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
      });
      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: true,
        sources: [source],
      });
      expect(report.dryRun).toBe(true);
      expect(report.repaired).toHaveLength(1);
      expect(source.info.url).toBe(
        `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`
      );
      expect(SourcesDataUpdate).not.toHaveBeenCalled();
      expect(SourcesFetchStateDataDelete).not.toHaveBeenCalled();
    });

    test("reports a vanished feed as orphaned without deleting it", async () => {
      const source = newSource("s1", {
        url: `${INTERNAL}/rss/vanished.aaaa`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "vanished",
        providerUrl: `${INTERNAL}/rss/vanished.aaaa`,
      });
      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: false,
        sources: [source],
      });
      expect(report.orphaned).toEqual([
        { sourceId: "s1", sourceName: "name-s1", feedId: "vanished" },
      ]);
      expect(report.repaired).toEqual([]);
      expect(SourcesDataUpdate).not.toHaveBeenCalled();
      expect(source.info.provider).toBe(NEWSLETTER_PROVIDER);
    });

    test("counts an unchanged source and skips unverified metadata", async () => {
      const unchanged = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
      });
      const mismatched = newSource("s2", {
        url: `${PUBLIC_ORIGIN}/rss/other.aaaa`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/other.aaaa`,
      });
      const missingId = newSource("s3", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
        provider: NEWSLETTER_PROVIDER,
      });
      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: true,
        sources: [unchanged, mismatched, missingId],
      });
      expect(report.unchanged).toBe(1);
      expect(report.unverified).toBe(2);
      expect(report.repaired).toEqual([]);
    });

    test("never touches a non-provider source", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
      });
      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: false,
        sources: [source],
      });
      expect(report.repaired).toEqual([]);
      expect(report.orphaned).toEqual([]);
      expect(report.unchanged).toBe(0);
      expect(SourcesDataUpdate).not.toHaveBeenCalled();
    });

    test("reports neither URLs nor tokens", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
      });
      const report = await NewsletterRepairProviderSources({} as any, {
        dryRun: true,
        sources: [source],
      });
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("http");
      expect(serialized).not.toContain("oldtoken");
      expect(serialized).not.toContain(".aaaa");
    });

    test("propagates a catalogue failure", async () => {
      jest.mocked(NewsletterGetFeeds).mockRejectedValueOnce(
        new NewsletterError("newsletter_unreachable", 502, "down")
      );
      await expect(
        NewsletterRepairProviderSources({} as any, {
          dryRun: true,
          sources: [],
        })
      ).rejects.toMatchObject({ code: "newsletter_unreachable" });
    });
  });

  describe("NewsletterAutoRepair", () => {
    test("does nothing when the integration is disabled", async () => {
      jest.mocked(ConfigGet).mockReturnValue({ NEWSLETTER_URL: "" } as any);
      await NewsletterAutoRepair({} as any);
      expect(SourcesDataListAll).not.toHaveBeenCalled();
    });

    test("does nothing when there is no provider source", async () => {
      jest
        .mocked(SourcesDataListAll)
        .mockResolvedValue([newSource("s1", { url: "https://x/f" })]);
      await NewsletterAutoRepair({} as any);
      expect(NewsletterGetFeeds).not.toHaveBeenCalled();
    });

    test("repairs provider sources and backs off after a failure", async () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
        providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.oldtoken`,
      });
      jest.mocked(SourcesDataListAll).mockResolvedValue([source]);

      jest
        .mocked(NewsletterGetFeeds)
        .mockRejectedValueOnce(
          new NewsletterError("newsletter_unreachable", 502, "down")
        );
      await NewsletterAutoRepair({} as any);
      expect(SourcesDataUpdate).not.toHaveBeenCalled();
      expect(NewsletterGetFeeds).toHaveBeenCalledTimes(1);

      // Still inside the 15-minute backoff: no second catalogue read.
      await NewsletterAutoRepair({} as any);
      expect(NewsletterGetFeeds).toHaveBeenCalledTimes(1);

      NewsletterResetAutoRepairForTests();
      await NewsletterAutoRepair({} as any);
      expect(NewsletterGetFeeds).toHaveBeenCalledTimes(2);
      expect(source.info.url).toBe(`${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`);
      expect(SourcesDataUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("NewsletterMatchExistingSourceByUrl", () => {
    const providerMeta = {
      provider: NEWSLETTER_PROVIDER,
      providerFeedId: "morningbrew",
      providerUrl: `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
    };

    test("matches any feed by normalized URL", () => {
      const source = newSource("s1", { url: "https://Example.com/feed/" });
      expect(
        NewsletterMatchExistingSourceByUrl(
          [source],
          "https://example.com/feed",
          null
        )
      ).toBe(source);
    });

    test("matches a provider source by stable feed id", () => {
      const source = newSource("s1", {
        url: "https://other.example/rss/x",
        provider: NEWSLETTER_PROVIDER,
        providerFeedId: "morningbrew",
      });
      expect(
        NewsletterMatchExistingSourceByUrl(
          [source],
          "https://other.example/rss/y",
          providerMeta
        )
      ).toBe(source);
    });

    test("matches a legacy source by parsed feed id", () => {
      const source = newSource("s1", {
        url: `${PUBLIC_ORIGIN}/rss/morningbrew.legacy`,
      });
      expect(
        NewsletterMatchExistingSourceByUrl(
          [source],
          `${PUBLIC_ORIGIN}/rss/morningbrew.aaaa`,
          providerMeta
        )
      ).toBe(source);
    });

    test("returns null when nothing matches", () => {
      const source = newSource("s1", { url: "https://example.com/feed" });
      expect(
        NewsletterMatchExistingSourceByUrl(
          [source],
          `${PUBLIC_ORIGIN}/rss/other`,
          { ...providerMeta, providerFeedId: "other" }
        )
      ).toBeNull();
    });
  });
});
