import {
  NEWSLETTER_PROVIDER,
  NewsletterAuthHeader,
  NewsletterBaseUrl,
} from "./NewsletterClient";
import { newsletterUrlOrigin } from "./NewsletterMatching";

export interface NewsletterFetchOptions {
  trustedOrigins: string[];
  headers: Record<string, string>;
  rewriteBase: string | null;
}

const EMPTY_OPTIONS: NewsletterFetchOptions = {
  trustedOrigins: [],
  headers: {},
  rewriteBase: null,
};

// Basic auth headers for the newsletter, or none when no password is set.
export function NewsletterAuthHeaders(): Record<string, string> {
  const authorization = NewsletterAuthHeader();
  return authorization ? { Authorization: authorization } : {};
}

function addOrigin(origins: Set<string>, url: unknown): void {
  if (typeof url !== "string") {
    return;
  }
  const origin = newsletterUrlOrigin(url);
  if (origin) {
    origins.add(origin);
  }
}

/**
 * Fetch options for a source. Nothing is trusted or authenticated unless the
 * source is a verified newsletter provider source, so every other source keeps
 * the default SSRF behaviour.
 */
export function NewsletterFetchOptionsForSource(info: any): NewsletterFetchOptions {
  if (info?.provider !== NEWSLETTER_PROVIDER) {
    return { ...EMPTY_OPTIONS };
  }
  const baseUrl = NewsletterBaseUrl();
  const origins = new Set<string>();
  addOrigin(origins, baseUrl);
  addOrigin(origins, info.providerUrl);
  addOrigin(origins, info.url);
  return {
    trustedOrigins: Array.from(origins),
    headers: NewsletterAuthHeaders(),
    rewriteBase: baseUrl || null,
  };
}

/**
 * Fetch options for a URL already resolved to newsletter provider metadata
 * (discover previews). The URL is fetched as requested, never rewritten.
 */
export function NewsletterFetchOptionsForUrl(
  url: string,
  providerMeta: { providerUrl?: string } | null | undefined,
): NewsletterFetchOptions {
  if (!providerMeta) {
    return { ...EMPTY_OPTIONS };
  }
  const origins = new Set<string>();
  addOrigin(origins, NewsletterBaseUrl());
  addOrigin(origins, providerMeta.providerUrl);
  addOrigin(origins, url);
  return {
    trustedOrigins: Array.from(origins),
    headers: NewsletterAuthHeaders(),
    rewriteBase: null,
  };
}
