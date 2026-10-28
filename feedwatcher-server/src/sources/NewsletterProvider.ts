import { Span } from "@opentelemetry/sdk-trace-base";
import { ConfigGet } from "../Config";
import { Source } from "../model/Source";
import { OTelLogger } from "../OTelContext";
import {
  NEWSLETTER_PROVIDER,
  NewsletterFeed,
  NewsletterGetFeeds,
} from "./NewsletterClient";
import {
  newsletterFeedIdFromUrl,
  newsletterUrlOrigin,
} from "./NewsletterMatching";
import { normalizeSourceUrl } from "./SourceUrl";
import {
  SourcesDataListAll,
  SourcesDataListForUser,
  SourcesDataUpdate,
} from "./SourcesData";
import { SourcesFetchStateDataDelete } from "./SourcesFetchStateData";

const logger = OTelLogger().createModuleLogger("NewsletterProvider");

const AUTO_REPAIR_FAILURE_BACKOFF_MS = 15 * 60 * 1000;

export interface NewsletterProviderMeta {
  provider: string;
  providerFeedId: string;
  providerUrl: string;
}

export interface NewsletterSourceReportEntry {
  sourceId: string;
  sourceName: string;
  feedId: string;
}

export interface NewsletterBackfillResult {
  scanned: number;
  tagged: number;
}

export interface NewsletterRepairReport {
  dryRun: boolean;
  catalogueAvailable: boolean;
  backfilled: number;
  repaired: NewsletterSourceReportEntry[];
  orphaned: NewsletterSourceReportEntry[];
  unchanged: number;
  unverified: number;
}

let lastAutoRepairFailureAt = 0;

export function NewsletterResetAutoRepairForTests(): void {
  lastAutoRepairFailureAt = 0;
}

function newsletterConfigured(): string {
  return String(ConfigGet().NEWSLETTER_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function isProviderSource(source: Source): boolean {
  return source?.info?.provider === NEWSLETTER_PROVIDER;
}

function reportEntry(source: Source, feedId: string): NewsletterSourceReportEntry {
  return { sourceId: source.id, sourceName: source.name, feedId };
}

async function listSources(
  span: Span,
  userId?: string,
): Promise<Source[]> {
  if (userId) {
    return SourcesDataListForUser(span, userId);
  }
  return SourcesDataListAll(span);
}

/**
 * Resolves newsletter provider metadata for a URL. Only a two-segment
 * `/rss/<feedId>[.<token>]` path can match; anything else is ignored. The
 * internal service origin resolves without any network call, otherwise the
 * catalogue confirms the feed id (or, for an orphan, the feed-URL origin).
 */
export async function NewsletterResolveProviderForUrl(
  url: string,
): Promise<NewsletterProviderMeta | null> {
  const baseUrl = newsletterConfigured();
  if (baseUrl === "") {
    return null;
  }
  const feedId = newsletterFeedIdFromUrl(url);
  const origin = newsletterUrlOrigin(url);
  if (!feedId || !origin) {
    return null;
  }
  if (origin === newsletterUrlOrigin(baseUrl)) {
    return {
      provider: NEWSLETTER_PROVIDER,
      providerFeedId: feedId,
      providerUrl: String(url).trim(),
    };
  }
  let catalogue: NewsletterFeed[];
  try {
    catalogue = await NewsletterGetFeeds();
  } catch {
    return null;
  }
  // The feed id alone is never enough: the URL must live on an origin the
  // catalogue confirms, otherwise a foreign (possibly internal) host could
  // borrow newsletter credentials and SSRF trust.
  const feed = catalogue.find((entry) => entry.providerFeedId === feedId);
  if (feed && newsletterUrlOrigin(feed.feedUrl) === origin) {
    return {
      provider: NEWSLETTER_PROVIDER,
      providerFeedId: feedId,
      providerUrl: feed.feedUrl,
    };
  }
  if (catalogue.some((entry) => newsletterUrlOrigin(entry.feedUrl) === origin)) {
    return {
      provider: NEWSLETTER_PROVIDER,
      providerFeedId: feedId,
      providerUrl: String(url).trim(),
    };
  }
  return null;
}

/**
 * Idempotently tags legacy newsletter sources with provider metadata. Only
 * URLs on a verified newsletter origin are tagged; URLs are never rewritten
 * and sources outside the newsletter origin are left untouched.
 */
export async function NewsletterBackfillProviders(
  span: Span,
  options: { useCatalogue: boolean; userId?: string },
): Promise<NewsletterBackfillResult> {
  const baseUrl = newsletterConfigured();
  if (baseUrl === "") {
    return { scanned: 0, tagged: 0 };
  }
  const sources = await listSources(span, options.userId);
  const verifiedOrigins = new Set<string>();
  const baseOrigin = newsletterUrlOrigin(baseUrl);
  if (baseOrigin) {
    verifiedOrigins.add(baseOrigin);
  }
  for (const source of sources) {
    if (isProviderSource(source)) {
      const origin =
        newsletterUrlOrigin(source.info.providerUrl) ??
        newsletterUrlOrigin(source.info.url);
      if (origin) {
        verifiedOrigins.add(origin);
      }
    }
  }
  if (options.useCatalogue) {
    try {
      for (const feed of await NewsletterGetFeeds()) {
        const origin = newsletterUrlOrigin(feed.feedUrl);
        if (origin) {
          verifiedOrigins.add(origin);
        }
      }
    } catch {
      logger.warn("Newsletter catalogue unavailable during provider backfill", span);
    }
  }
  let tagged = 0;
  for (const source of sources) {
    if (source.info?.provider) {
      continue;
    }
    const feedId = newsletterFeedIdFromUrl(source.info?.url);
    const origin = newsletterUrlOrigin(source.info?.url);
    if (!feedId || !origin || !verifiedOrigins.has(origin)) {
      continue;
    }
    source.info.provider = NEWSLETTER_PROVIDER;
    source.info.providerFeedId = feedId;
    source.info.providerUrl = source.info.url;
    await SourcesDataUpdate(span, source);
    tagged++;
  }
  if (tagged > 0) {
    logger.info(
      `Newsletter provider backfill tagged ${tagged} of ${sources.length} sources`,
      span,
    );
  }
  return { scanned: sources.length, tagged };
}

/**
 * Repairs provider sources whose stored URL no longer matches the catalogue
 * (token rotation) and reports sources whose feed disappeared. Never deletes
 * user data and never touches a source without provider metadata.
 */
export async function NewsletterRepairProviderSources(
  span: Span,
  options: {
    userId?: string;
    dryRun: boolean;
    sources?: Source[];
    backfilled?: number;
  },
): Promise<NewsletterRepairReport> {
  const dryRun = options.dryRun !== false;
  // Throws NewsletterError when the catalogue is unavailable; route callers
  // map it to a response and the scheduler swallows it.
  const catalogue: NewsletterFeed[] = await NewsletterGetFeeds();
  const catalogueById = new Map(
    catalogue.map((feed) => [feed.providerFeedId, feed]),
  );
  const sources =
    options.sources ?? (await listSources(span, options.userId));
  const report: NewsletterRepairReport = {
    dryRun,
    catalogueAvailable: true,
    backfilled: options.backfilled ?? 0,
    repaired: [],
    orphaned: [],
    unchanged: 0,
    unverified: 0,
  };

  for (const source of sources) {
    if (!isProviderSource(source)) {
      continue;
    }
    const providerFeedId =
      typeof source.info.providerFeedId === "string" &&
      source.info.providerFeedId !== ""
        ? source.info.providerFeedId
        : null;
    const urlFeedId = newsletterFeedIdFromUrl(source.info.url);
    if (!providerFeedId || !urlFeedId || urlFeedId !== providerFeedId) {
      report.unverified++;
      continue;
    }
    const feed = catalogueById.get(providerFeedId);
    if (!feed) {
      report.orphaned.push(reportEntry(source, providerFeedId));
      continue;
    }
    const storedUrl = String(source.info.url ?? "");
    const storedProviderUrl = String(source.info.providerUrl ?? "");
    if (storedUrl === feed.feedUrl && storedProviderUrl === feed.feedUrl) {
      report.unchanged++;
      continue;
    }
    if (!dryRun) {
      source.info.url = feed.feedUrl;
      source.info.providerUrl = feed.feedUrl;
      delete source.info.fetchErrorCount;
      delete source.info.autoDisabled;
      delete source.info.autoDisabledDate;
      delete source.info.autoDisabledReason;
      delete source.info.retryAfterUntil;
      delete source.info.lastFetchError;
      delete source.info.lastFetchErrorDate;
      delete source.info.lastFetchErrorStatus;
      delete source.info.lastFetchErrorClass;
      delete source.info.lastAttemptDate;
      await SourcesFetchStateDataDelete(span, source.id);
      await SourcesDataUpdate(span, source);
    }
    report.repaired.push(reportEntry(source, providerFeedId));
  }

  return report;
}

/**
 * Runs the repair before a scheduled fetch cycle. A catalogue failure backs
 * off for 15 minutes so an unreachable newsletter cannot stall every cycle.
 */
export async function NewsletterAutoRepair(span: Span): Promise<void> {
  if (newsletterConfigured() === "") {
    return;
  }
  if (
    lastAutoRepairFailureAt > 0 &&
    Date.now() - lastAutoRepairFailureAt < AUTO_REPAIR_FAILURE_BACKOFF_MS
  ) {
    return;
  }
  try {
    const sources = await SourcesDataListAll(span);
    if (!sources.some((source) => isProviderSource(source))) {
      return;
    }
    const report = await NewsletterRepairProviderSources(span, {
      dryRun: false,
      sources,
    });
    lastAutoRepairFailureAt = 0;
    if (report.repaired.length > 0) {
      logger.info(
        `Automatically repaired ${report.repaired.length} newsletter source(s)`,
        span,
      );
    }
  } catch {
    lastAutoRepairFailureAt = Date.now();
    logger.warn("Newsletter source auto-repair skipped", span);
  }
}

/**
 * Finds an existing source for a URL: normalized URL for any feed, and for
 * newsletter URLs also the feed id (provider metadata or a legacy URL), so a
 * bare and tokenized form of the same feed never duplicates a source.
 */
export function NewsletterMatchExistingSourceByUrl(
  existingSources: Source[],
  url: string,
  providerMeta: NewsletterProviderMeta | null,
): Source | null {
  const normalizedUrl = normalizeSourceUrl(url);
  for (const existing of existingSources) {
    if (normalizeSourceUrl(existing?.info?.url) === normalizedUrl) {
      return existing;
    }
  }
  if (!providerMeta) {
    return null;
  }
  for (const existing of existingSources) {
    if (
      isProviderSource(existing) &&
      existing.info.providerFeedId === providerMeta.providerFeedId
    ) {
      return existing;
    }
  }
  for (const existing of existingSources) {
    if (isProviderSource(existing)) {
      continue;
    }
    if (
      newsletterFeedIdFromUrl(existing?.info?.url) ===
      providerMeta.providerFeedId
    ) {
      return existing;
    }
  }
  return null;
}
