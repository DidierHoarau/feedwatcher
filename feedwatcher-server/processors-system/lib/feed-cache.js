// Per-cycle feed fetch/parse cache shared by the feed processors.
// Plain CommonJS so bundled processors can require it directly; this file is
// not a processor itself (the processor scan only looks at top-level .js files).
const { parseFeed } = require("@rowanmanning/feed-parser");
const { fetchText } = require("./ssrf-http");

class FeedNotModifiedError extends Error {
  constructor(url) {
    // The URL can carry a private feed token: never put it in the message,
    // which ends up in logs and stored fetch errors.
    super("Feed not modified");
    this.name = "FeedNotModifiedError";
    this.url = url;
    this.statusCode = 304;
  }
}

function safeOrigin(urlRaw) {
  try {
    return new URL(String(urlRaw)).origin;
  } catch {
    return null;
  }
}

/**
 * Create the fetch state shared by every processor call for one source cycle.
 *
 * The HTTP fetch and the parsed feed are cached per URL, including rejected
 * fetches, so the processors that detect and then read a source reuse the
 * same download. The cache lives only for one source cycle: conditional GET
 * avoids re-downloading unchanged feeds across cycles.
 *
 * Optional settings keep the newsletter integration working over an internal
 * service URL: `trustedOrigins` are the only origins allowed to resolve to
 * private addresses, `headers` are sent on every request (Basic auth), and
 * `rewriteBase` switches a trusted advertised URL to the configured base
 * while the advertised URL stays the cache/validator identity.
 */
function createFeedFetchContext(options = {}) {
  const validators = options.validators || null;
  const signal = options.signal;
  const trustedOrigins = Array.isArray(options.trustedOrigins)
    ? options.trustedOrigins
    : [];
  const baseHeaders = options.headers || {};
  const rewriteBase = options.rewriteBase || null;
  const cache = new Map();
  const notModifiedUrls = new Set();
  let updatedState = null;

  function conditionalHeaders(url) {
    const headers = {};
    if (validators && validators.url === url) {
      if (validators.etag) {
        headers["If-None-Match"] = validators.etag;
      }
      if (validators.lastModified) {
        headers["If-Modified-Since"] = validators.lastModified;
      }
    }
    return headers;
  }

  // Provider sources keep the advertised URL as identity but fetch the same
  // path through the configured newsletter base so traffic stays in-cluster.
  function fetchUrlFor(url) {
    if (!rewriteBase) {
      return url;
    }
    const origin = safeOrigin(url);
    if (!origin || !trustedOrigins.includes(origin)) {
      return url;
    }
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      return url;
    }
    return `${String(rewriteBase).replace(/\/+$/, "")}${parsed.pathname}${parsed.search}`;
  }

  async function getFeed(url, fetchOptions = {}) {
    const cached = cache.get(url);
    if (cached) {
      if (cached.error) {
        throw cached.error;
      }
      return cached.feed;
    }

    let response;
    try {
      response = await fetchText(fetchUrlFor(url), {
        timeoutMs: fetchOptions.timeoutMs,
        maxContentLength: fetchOptions.maxContentLength,
        allowedContentTypes: null,
        headers: Object.assign({}, baseHeaders, conditionalHeaders(url)),
        trustedOrigins,
        signal,
      });
    } catch (err) {
      cache.set(url, { error: err });
      throw err;
    }

    if (response.status === 304) {
      notModifiedUrls.add(url);
      const etag = response.headers && response.headers.etag;
      const lastModified = response.headers && response.headers["last-modified"];
      if ((etag || lastModified) && validators && validators.url === url) {
        updatedState = {
          url,
          etag: etag || validators.etag || null,
          lastModified: lastModified || validators.lastModified || null,
        };
      }
      const notModifiedError = new FeedNotModifiedError(url);
      cache.set(url, { error: notModifiedError });
      throw notModifiedError;
    }

    let feed;
    try {
      feed = parseFeed(response.data);
    } catch (err) {
      cache.set(url, { error: err });
      throw err;
    }
    updatedState = {
      url,
      etag: (response.headers && response.headers.etag) || null,
      lastModified:
        (response.headers && response.headers["last-modified"]) || null,
    };
    cache.set(url, { feed });
    return feed;
  }

  return {
    getFeed,
    isNotModified: (url) => notModifiedUrls.has(url),
    getUpdatedState: () => updatedState,
  };
}

module.exports = {
  createFeedFetchContext,
  FeedNotModifiedError,
};
