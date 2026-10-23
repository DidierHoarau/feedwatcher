// Per-cycle feed fetch/parse cache shared by the feed processors.
// Plain CommonJS so bundled processors can require it directly; this file is
// not a processor itself (the processor scan only looks at top-level .js files).
const { parseFeed } = require("@rowanmanning/feed-parser");
const { fetchText } = require("./ssrf-http");

class FeedNotModifiedError extends Error {
  constructor(url) {
    super(`Feed not modified: ${url}`);
    this.name = "FeedNotModifiedError";
    this.url = url;
    this.statusCode = 304;
  }
}

/**
 * Create the fetch state shared by every processor call for one source cycle.
 *
 * The HTTP fetch and the parsed feed are cached per URL, including rejected
 * fetches, so the processors that detect and then read a source reuse the
 * same download. The cache lives only for one source cycle: conditional GET
 * avoids re-downloading unchanged feeds across cycles.
 */
function createFeedFetchContext(options = {}) {
  const validators = options.validators || null;
  const signal = options.signal;
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
      response = await fetchText(url, {
        timeoutMs: fetchOptions.timeoutMs,
        maxContentLength: fetchOptions.maxContentLength,
        allowedContentTypes: null,
        headers: conditionalHeaders(url),
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
