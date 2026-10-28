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
