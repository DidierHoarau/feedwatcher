import axios from "axios";
import { ConfigGet } from "../Config";
import { OTelLogger } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("NewsletterClient");

export const NEWSLETTER_PROVIDER = "feedwatcher-newsletter";

const CACHE_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_FEEDS = 1000;
const MAX_FEED_ID_CHARS = 128;
const MAX_DISPLAY_CHARS = 500;
const CATALOGUE_VERSION = 1;

export type NewsletterErrorCode =
  | "newsletter_disabled"
  | "newsletter_timeout"
  | "newsletter_auth_failed"
  | "newsletter_unreachable"
  | "newsletter_invalid_response";

export class NewsletterError extends Error {
  public code: NewsletterErrorCode;
  public statusCode: number;

  constructor(code: NewsletterErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = "NewsletterError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface NewsletterFeed {
  providerFeedId: string;
  title: string;
  senderName: string;
  senderEmail: string;
  itemCount: number;
  latestDate: string | null;
  feedUrl: string;
}

interface NewsletterCache {
  baseUrl: string;
  feeds: NewsletterFeed[];
  etag: string;
  lastModified: string;
  source: "catalogue" | "legacy";
  fetchedAt: number;
}

let cache: NewsletterCache = null;

export function NewsletterResetCacheForTests(): void {
  cache = null;
}

export function NewsletterBaseUrl(): string {
  return String(ConfigGet().NEWSLETTER_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
}

// Basic Authorization value for the newsletter, or null when no password is
// configured. Credentials live in configuration/secrets only.
export function NewsletterAuthHeader(): string | null {
  const config = ConfigGet();
  const password = String(config.NEWSLETTER_AUTH_PASSWORD ?? "");
  if (password === "") {
    return null;
  }
  const username = String(config.NEWSLETTER_AUTH_USERNAME ?? "");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function buildHeaders(conditional: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const authorization = NewsletterAuthHeader();
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (conditional && cache) {
    if (cache.etag) {
      headers["If-None-Match"] = cache.etag;
    }
    if (cache.lastModified) {
      headers["If-Modified-Since"] = cache.lastModified;
    }
  }
  return headers;
}

function invalidResponse(): NewsletterError {
  return new NewsletterError(
    "newsletter_invalid_response",
    502,
    "The newsletter service returned an unexpected response.",
  );
}

function isTimeoutError(err: any): boolean {
  return (
    err?.code === "ECONNABORTED" ||
    err?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(err?.message ?? ""))
  );
}

function truncate(value: string): string {
  return value.length > MAX_DISPLAY_CHARS
    ? value.substring(0, MAX_DISPLAY_CHARS)
    : value;
}

function parseFeedUrl(raw: any): string | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  return parsed.toString();
}

function parseLatestDate(raw: any): string | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (typeof raw !== "string") {
    throw invalidResponse();
  }
  if (Number.isNaN(Date.parse(raw))) {
    throw invalidResponse();
  }
  return raw;
}

function parseFeedId(raw: any): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const id = raw.trim();
  if (id === "" || id.length > MAX_FEED_ID_CHARS) {
    return null;
  }
  return id;
}

function parseItemCount(raw: any): number {
  const count = Number(raw);
  if (!Number.isFinite(count) || count < 0) {
    throw invalidResponse();
  }
  return count;
}

function feedFromCatalogueEntry(entry: any): NewsletterFeed {
  if (!entry || typeof entry !== "object") {
    throw invalidResponse();
  }
  const providerFeedId = parseFeedId(entry.feedId);
  const feedUrl = parseFeedUrl(entry.feedUrl);
  if (!providerFeedId || !feedUrl) {
    throw invalidResponse();
  }
  const senderName =
    typeof entry.senderName === "string" ? truncate(entry.senderName) : "";
  const senderEmail =
    typeof entry.senderEmail === "string" ? truncate(entry.senderEmail) : "";
  const title =
    typeof entry.title === "string" && entry.title.trim() !== ""
      ? truncate(entry.title)
      : senderName || providerFeedId;
  return {
    providerFeedId,
    title,
    senderName: senderName || title,
    senderEmail,
    itemCount: parseItemCount(entry.itemCount),
    latestDate: parseLatestDate(entry.latestDate),
    feedUrl,
  };
}

// Only the documented v1 contract is accepted; additive unknown fields are
// ignored so the interface can evolve without breaking this client.
function parseCatalogue(data: any): NewsletterFeed[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw invalidResponse();
  }
  if (data.version !== CATALOGUE_VERSION) {
    throw invalidResponse();
  }
  if (!Array.isArray(data.feeds) || data.feeds.length > MAX_FEEDS) {
    throw invalidResponse();
  }
  return data.feeds.map((entry: any) => feedFromCatalogueEntry(entry));
}

// Legacy `/rss/` JSON array: tolerated only when every entry carries the
// fields the integration needs; the catalogue is preferred when available.
function parseLegacyFeeds(data: any): NewsletterFeed[] {
  if (!Array.isArray(data) || data.length > MAX_FEEDS) {
    throw invalidResponse();
  }
  return data.map((entry: any) => {
    if (!entry || typeof entry !== "object") {
      throw invalidResponse();
    }
    const feedUrl = parseFeedUrl(entry.feedUrl);
    const providerFeedId = parseFeedId(
      typeof entry.feedId === "string" ? entry.feedId : entry.id,
    );
    if (!feedUrl || !providerFeedId) {
      throw invalidResponse();
    }
    const senderName =
      typeof entry.senderName === "string" ? truncate(entry.senderName) : "";
    const senderEmail =
      typeof entry.senderEmail === "string" ? truncate(entry.senderEmail) : "";
    const title =
      typeof entry.title === "string" && entry.title.trim() !== ""
        ? truncate(entry.title)
        : senderName || providerFeedId;
    const itemCount = Number(entry.itemCount);
    return {
      providerFeedId,
      title,
      senderName: senderName || title,
      senderEmail,
      itemCount: Number.isFinite(itemCount) && itemCount >= 0 ? itemCount : 0,
      latestDate: parseLatestDate(entry.latestDate),
      feedUrl,
    };
  });
}

function responseHeader(response: any, name: string): string {
  const headers = response?.headers;
  if (!headers) {
    return "";
  }
  const value =
    typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof value === "string" ? value : "";
}

async function fetchNewsletter(
  url: string,
  conditional: boolean,
): Promise<any> {
  return axios.get(url, {
    headers: buildHeaders(conditional),
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    // Basic credentials must never follow a cross-origin redirect.
    maxRedirects: 0,
    validateStatus: () => true,
  });
}

export async function NewsletterGetFeeds(
  options: { force?: boolean } = {},
): Promise<NewsletterFeed[]> {
  const baseUrl = NewsletterBaseUrl();
  if (baseUrl === "") {
    throw new NewsletterError(
      "newsletter_disabled",
      503,
      "The newsletter integration is not configured.",
    );
  }
  if (cache && cache.baseUrl !== baseUrl) {
    cache = null;
  }
  if (
    cache &&
    !options.force &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache.feeds;
  }

  // Validators are endpoint-specific: a legacy `/rss/` ETag must not be sent
  // to `/api/feeds` and vice versa.
  const conditional = cache !== null && cache.source === "catalogue";

  let response: any;
  try {
    response = await fetchNewsletter(`${baseUrl}/api/feeds`, conditional);
  } catch (err: any) {
    if (isTimeoutError(err)) {
      logger.warn("Newsletter catalogue request timed out");
    } else {
      logger.warn(
        `Newsletter catalogue unreachable: ${err?.code ?? err?.message ?? "unknown error"}`,
      );
    }
    return newsletterFetchLegacy(baseUrl);
  }

  if (response.status === 304 && cache) {
    cache.fetchedAt = Date.now();
    return cache.feeds;
  }
  if (response.status === 401 || response.status === 403) {
    logger.warn(
      `Newsletter catalogue rejected the credentials (HTTP ${response.status})`,
    );
    throw new NewsletterError(
      "newsletter_auth_failed",
      502,
      "The newsletter service rejected FeedWatcher's credentials.",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    logger.warn(
      `Newsletter catalogue unavailable (HTTP ${response.status})`,
    );
    return newsletterFetchLegacy(baseUrl);
  }

  let feeds: NewsletterFeed[];
  try {
    feeds = parseCatalogue(response.data);
  } catch (err) {
    if (err instanceof NewsletterError) {
      logger.warn("Newsletter catalogue returned an invalid payload");
      return newsletterFetchLegacy(baseUrl);
    }
    throw err;
  }

  cache = {
    baseUrl,
    feeds,
    etag: responseHeader(response, "etag"),
    lastModified: responseHeader(response, "last-modified"),
    source: "catalogue",
    fetchedAt: Date.now(),
  };
  return feeds;
}

async function newsletterFetchLegacy(
  baseUrl: string,
): Promise<NewsletterFeed[]> {
  let response: any;
  try {
    response = await fetchNewsletter(
      `${baseUrl}/rss/`,
      cache !== null && cache.source === "legacy",
    );
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw new NewsletterError(
        "newsletter_timeout",
        504,
        "The newsletter service did not answer in time.",
      );
    }
    throw new NewsletterError(
      "newsletter_unreachable",
      502,
      "The newsletter service is unreachable.",
    );
  }
  if (response.status === 304 && cache) {
    cache.fetchedAt = Date.now();
    return cache.feeds;
  }
  if (response.status === 401 || response.status === 403) {
    throw new NewsletterError(
      "newsletter_auth_failed",
      502,
      "The newsletter service rejected FeedWatcher's credentials.",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new NewsletterError(
      "newsletter_unreachable",
      502,
      "The newsletter service is unavailable.",
    );
  }
  let feeds: NewsletterFeed[];
  try {
    feeds = parseLegacyFeeds(response.data);
  } catch {
    throw invalidResponse();
  }
  cache = {
    baseUrl,
    feeds,
    etag: responseHeader(response, "etag"),
    lastModified: responseHeader(response, "last-modified"),
    source: "legacy",
    fetchedAt: Date.now(),
  };
  return feeds;
}
