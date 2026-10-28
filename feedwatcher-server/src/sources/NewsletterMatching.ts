import { NewsletterFeed, NEWSLETTER_PROVIDER } from "./NewsletterClient";

const MAX_FEED_ID_CHARS = 128;

// Feed id carried by a newsletter feed URL. The newsletter serves
// `/rss/<feedId>` and, when private URLs are enabled, `/rss/<feedId>.<token>`;
// both forms resolve to the same feed, so a dotted token suffix is stripped
// (same rule as the newsletter's FeedIdentityResolveFeedUrlId).
export function newsletterFeedIdFromUrl(url: string): string | null {
  if (typeof url !== "string" || url.trim() === "") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length !== 2 || segments[0] !== "rss") {
    return null;
  }
  let id: string;
  try {
    id = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  const dotIndex = id.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < id.length - 1) {
    id = id.slice(0, dotIndex);
  }
  if (id === "" || id.length > MAX_FEED_ID_CHARS) {
    return null;
  }
  return id;
}

interface SourceIdentity {
  id?: string;
  info?: any;
}

// Exact `URL.origin` (scheme + host + port) of a URL, or null when invalid.
export function newsletterUrlOrigin(url: string): string | null {
  if (typeof url !== "string" || url.trim() === "") {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username !== "" || parsed.password !== "") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

// Removes the private token suffix from a newsletter feed URL
// (`/rss/<feedId>.<token>` → `/rss/<feedId>`) so it can be logged safely.
// Other URLs and anything that is not a two-segment `/rss/` path are returned
// unchanged.
export function newsletterRedactUrl(url: string): string {
  if (typeof url !== "string" || url.trim() === "") {
    return url;
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return url;
  }
  const rawSegments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (rawSegments.length !== 2 || rawSegments[0] !== "rss") {
    return url;
  }
  const dotIndex = rawSegments[1].indexOf(".");
  if (dotIndex <= 0) {
    return url;
  }
  const redacted = [parsed.origin, "rss", rawSegments[1].slice(0, dotIndex)];
  return `${redacted[0]}/${redacted[1]}/${redacted[2]}${parsed.search}`;
}

// Redacts every newsletter feed token found in free-form text (log messages,
// stored fetch errors) while leaving the rest untouched.
export function newsletterRedactText(text: string): string {
  if (typeof text !== "string" || text === "") {
    return text;
  }
  return text.replace(/(\/rss\/)([^/\s?#]+)/gi, (match, prefix, segment) => {
    const dotIndex = segment.indexOf(".");
    if (dotIndex <= 0) {
      return match;
    }
    return `${prefix}${segment.slice(0, dotIndex)}`;
  });
}

// Maps each catalogue feed id to the user's existing source. Primary identity
// is the explicit provider metadata; the legacy fallback parses the id out of
// the source URL so bare-id subscriptions (and their tokenised variants) keep
// matching. The full URL is never used as identity.
export function newsletterFindSourceIds(
  sources: SourceIdentity[],
  catalogueFeedIds: Set<string>,
): Map<string, string> {
  const found = new Map<string, string>();
  // Primary metadata wins over a legacy URL match for the same feed id.
  for (const source of sources) {
    const info = source?.info;
    if (
      info?.provider === NEWSLETTER_PROVIDER &&
      typeof info.providerFeedId === "string" &&
      catalogueFeedIds.has(info.providerFeedId) &&
      typeof source.id === "string" &&
      !found.has(info.providerFeedId)
    ) {
      found.set(info.providerFeedId, source.id);
    }
  }
  for (const source of sources) {
    const info = source?.info;
    if (info?.provider === NEWSLETTER_PROVIDER) {
      continue;
    }
    const legacyId = newsletterFeedIdFromUrl(info?.url);
    if (
      legacyId &&
      catalogueFeedIds.has(legacyId) &&
      typeof source.id === "string" &&
      !found.has(legacyId)
    ) {
      found.set(legacyId, source.id);
    }
  }
  return found;
}

export type NewsletterFeedState = "added" | "available" | "ignored";

export interface NewsletterCatalogueFeed extends NewsletterFeed {
  state: NewsletterFeedState;
  existingSourceId?: string;
}

// Precedence: added > ignored > available. An added feed keeps its source
// link even when the user also ignored it; ignoring never hides a row.
export function newsletterCatalogueStates(
  feeds: NewsletterFeed[],
  sourceIdsByFeedId: Map<string, string>,
  ignoredFeedIds: Set<string>,
): NewsletterCatalogueFeed[] {
  return feeds.map((feed) => {
    const existingSourceId = sourceIdsByFeedId.get(feed.providerFeedId);
    const entry: NewsletterCatalogueFeed = {
      ...feed,
      state: existingSourceId ? "added" : "available",
    };
    if (existingSourceId) {
      entry.existingSourceId = existingSourceId;
    } else if (ignoredFeedIds.has(feed.providerFeedId)) {
      entry.state = "ignored";
    }
    return entry;
  });
}
