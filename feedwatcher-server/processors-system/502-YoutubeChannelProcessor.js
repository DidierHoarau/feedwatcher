// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const { parseFeed } = require("@rowanmanning/feed-parser");

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

const AXIOS_TIMEOUT_MS = 10000;

// Feed endpoints tried in order by fetchLatest. Alternate endpoints can be
// configured for networks where YouTube's RSS endpoint is unreliable
// (e.g. FEEDWATCHER_YOUTUBE_FEED_URLS pointing at an Invidious-style
// mirror), as comma-separated URL templates containing a {channelId}
// placeholder.
const DEFAULT_FEED_URL_TEMPLATES = [
  "https://www.youtube.com/feeds/videos.xml?channel_id={channelId}",
];

function getFeedUrlTemplates() {
  const raw = process.env.FEEDWATCHER_YOUTUBE_FEED_URLS;
  if (!raw || !raw.trim()) {
    return DEFAULT_FEED_URL_TEMPLATES;
  }
  const templates = raw
    .split(",")
    .map((template) => template.trim())
    .filter((template) => template.includes("{channelId}"));
  return templates.length > 0 ? templates : DEFAULT_FEED_URL_TEMPLATES;
}

// YouTube's RSS feed endpoint intermittently fails with 5xx or network
// errors; retrying the same request usually works. 4xx responses (dead
// channel 404, rate-limit 429) are not retried: they do not recover within
// milliseconds and retrying them only amplifies the request storm.
const FETCH_RETRY_DELAYS_MS = [250, 500, 1000];

// Supported URL forms: @handle, /channel/UC..., /user/..., /c/...
const CHANNEL_URL_PATTERN =
  /^https?:\/\/(www\.|m\.)?youtube\.com\/(@[^/?#]+|(channel|user|c)\/[^/?#]+)/i;

// A video's short/not-short status is immutable, so classify it once and keep
// the result across fetch cycles. Bounded TTL + FIFO eviction keeps the cache
// small; only definitive outcomes (2xx = short, 3xx = not short) are stored so
// transient failures are retried on the next cycle.
const SHORTS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SHORTS_CACHE_MAX_ENTRIES = 5000;
const shortsCache = new Map();

function getCachedShortsClassification(videoId) {
  const entry = shortsCache.get(videoId);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    shortsCache.delete(videoId);
    return undefined;
  }
  return entry.isShort;
}

function cacheShortsClassification(videoId, isShort) {
  if (shortsCache.size >= SHORTS_CACHE_MAX_ENTRIES) {
    const oldestKey = shortsCache.keys().next().value;
    shortsCache.delete(oldestKey);
  }
  shortsCache.set(videoId, {
    isShort,
    expiresAt: Date.now() + SHORTS_CACHE_TTL_MS,
  });
}

function resetShortsCache() {
  shortsCache.clear();
}

async function probeIsShort(videoId) {
  try {
    const response = await axios.get(`https://www.youtube.com/shorts/${videoId}`, {
      maxRedirects: 0,
      timeout: AXIOS_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const status = response && response.status;
    if (status >= 200 && status < 300) {
      return { definitive: true, isShort: true };
    }
    if (status >= 300 && status < 400) {
      return { definitive: true, isShort: false };
    }
  } catch (err) {
    // Network errors stay uncached so they are retried next cycle.
  }
  return { definitive: false, isShort: false };
}

// Extraction strategies against the channel page HTML, tried in order.
// The (?![A-Za-z0-9_-]) lookahead prevents matching a truncated ID from a
// longer malformed string.
const PAGE_EXTRACTION_PATTERNS = [
  /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])/,
  /<meta[^>]+itemprop="identifier"[^>]+content="(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])/,
  /<meta[^>]+content="(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])[^>]+itemprop="identifier"/,
  /<link[^>]+rel="canonical"[^>]+href="[^"]*\/channel\/(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])/,
  /<link[^>]+href="[^"]*\/channel\/(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])[^>]+rel="canonical"/,
  /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"(?![A-Za-z0-9_-])/,
  /channel_id=(UC[A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/,
];

// Browser-like headers; SOCS=CAE makes YouTube serve the regular page instead
// of the consent interstitial (e.g. for instances hosted in Hong Kong).
const REQUEST_HEADERS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "SOCS=CAE",
  },
  timeout: AXIOS_TIMEOUT_MS,
};

function isValidChannelId(channelId) {
  return typeof channelId === "string" && CHANNEL_ID_PATTERN.test(channelId);
}

function isClientError(err) {
  const status = err && err.response ? err.response.status : undefined;
  return typeof status === "number" && status >= 400 && status < 500;
}

async function fetchWithRetry(url, config) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) =>
        setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt - 1])
      );
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      return (await axios.get(url, config)).data;
    } catch (err) {
      if (isClientError(err)) {
        throw err;
      }
      lastError = err;
    }
  }
  throw lastError;
}

function extractChannelIdFromUrl(url) {
  const urlMatch = /\/channel\/(UC[A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(url);
  return urlMatch ? urlMatch[1] : null;
}

function extractChannelIdFromPage(pageRaw) {
  for (const pattern of PAGE_EXTRACTION_PATTERNS) {
    const match = pattern.exec(pageRaw);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function resolveChannelIdAndPage(source) {
  if (isValidChannelId(source.info.channelId)) {
    return { channelId: source.info.channelId, pageRaw: null };
  }
  const channelIdFromUrl = extractChannelIdFromUrl(source.info.url);
  if (channelIdFromUrl) {
    return { channelId: channelIdFromUrl, pageRaw: null };
  }
  const pageRaw = await fetchWithRetry(source.info.url, REQUEST_HEADERS);
  return { channelId: extractChannelIdFromPage(pageRaw), pageRaw };
}

async function resolveChannelId(source) {
  return (await resolveChannelIdAndPage(source)).channelId;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractChannelTitleFromPage(pageRaw) {
  const patterns = [
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/,
    /<meta[^>]+content="([^"]+)"[^>]+property="og:title"/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(pageRaw);
    if (match && match[1].trim()) {
      return decodeHtmlEntities(match[1].trim());
    }
  }
  return null;
}

// eslint-disable-next-line no-undef
module.exports = {
  resetShortsCache,
  //
  getInfo: () => {
    return {
      title: "YouTube Channel",
      description:
        "Follows uploads from a YouTube channel. <br/>" +
        "Expected URLs: a channel handle url (youtube.com/@handle), a channel id url (youtube.com/channel/UC...), a legacy user url (youtube.com/user/...) or a custom url (youtube.com/c/...)",
      icon: "youtube",
    };
  },

  test: async (source) => {
    try {
      if (!CHANNEL_URL_PATTERN.test(source.info.url)) {
        return null;
      }
      if (source.info.processorPath && isValidChannelId(source.info.channelId)) {
        // Already a registered YouTube source: skip the network validation
        // that YouTube rate-limits, and skip a feed fetch on every cycle.
        return { name: source.name, icon: "youtube", channelId: source.info.channelId };
      }
      const { channelId, pageRaw } = await resolveChannelIdAndPage(source);
      if (!channelId) {
        return null;
      }
      try {
        const feed = parseFeed(
          await fetchWithRetry(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
            REQUEST_HEADERS
          )
        );
        if (feed.title) {
          return { name: feed.title, icon: "youtube", channelId };
        }
      } catch (err) {
        // The RSS feed endpoint is unreachable for some IPs/regions (or the
        // intermittent 404s outlasted the retries): accept the source anyway
        // with the channel name taken from the page, instead of failing the
        // add with "no processor matching".
        let html = pageRaw;
        if (!html) {
          html = await fetchWithRetry(source.info.url, REQUEST_HEADERS);
        }
        const pageTitle = extractChannelTitleFromPage(html);
        if (pageTitle) {
          console.warn(
            `YouTube processor: feed unreachable for ${channelId} (${
              err && err.message ? err.message : err
            }), accepting source via page title`
          );
          return { name: pageTitle, icon: "youtube", channelId };
        }
      }
    } catch (err) {
      console.warn(
        `YouTube processor: could not test source ${source.info.url}: ${
          err && err.message ? err.message : err
        }`
      );
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let channelId = null;
    try {
      channelId = await resolveChannelId(source);
    } catch (err) {
      throw new Error(
        `Could not resolve YouTube channel ID for ${source.info.url}: ${
          err && err.message ? err.message : err
        }`,
        { cause: err }
      );
    }
    if (!channelId) {
      throw new Error(
        `Could not resolve YouTube channel ID for ${source.info.url}`
      );
    }
    let feedRaw = null;
    let lastFeedError = null;
    for (const template of getFeedUrlTemplates()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        feedRaw = await fetchWithRetry(
          template.replace("{channelId}", channelId),
          REQUEST_HEADERS
        );
        break;
      } catch (err) {
        lastFeedError = err;
      }
    }
    if (feedRaw === null) {
      throw new Error(
        `YouTube feed not reachable for channel ${channelId} (${
          lastFeedError && lastFeedError.message
            ? lastFeedError.message
            : lastFeedError
        })`,
        { cause: lastFeedError }
      );
    }
    const feed = parseFeed(feedRaw);
    const sourceItems = [];
    // Probe each video at most once per fetch cycle
    const shortsProbeCache = new Map();
    for (let item of feed.items) {
      const sourceItem = {};
      sourceItem.url = item.url;
      sourceItem.title = item.title;
      sourceItem.content = item.content || "";
      sourceItem.content += `<iframe src='https://www.youtube.com/embed/${
        item.id.split(":")[2]
      }/' frameborder='0' allowfullscreen ></iframe >`;
      sourceItem.datePublished = new Date(item.published);
      sourceItem.thumbnail = item.image.url;
      const videoId = item.id.split(":")[2];
      let isShort = shortsProbeCache.get(videoId);
      if (isShort === undefined) {
        isShort = getCachedShortsClassification(videoId);
      }
      if (isShort === undefined) {
        const probe = await probeIsShort(videoId);
        // Cache the in-cycle outcome even when not definitive (so a duplicate
        // video is not re-probed now) but persist only definitive results.
        isShort = probe.isShort;
        if (probe.definitive) {
          cacheShortsClassification(videoId, isShort);
        }
        shortsProbeCache.set(videoId, isShort);
      }
      if (isShort) {
        sourceItem.title = `${sourceItem.title} (#shorts)`;
      }
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
