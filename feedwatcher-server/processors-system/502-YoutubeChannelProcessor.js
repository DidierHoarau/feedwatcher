// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const { parseFeed } = require("@rowanmanning/feed-parser");

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

// YouTube's RSS feed endpoint intermittently fails with 404 or network
// errors (seen for every channel); retrying the same request usually works.
const FETCH_RETRY_DELAYS_MS = [250, 500, 1000];

// Supported URL forms: @handle, /channel/UC..., /user/..., /c/...
const CHANNEL_URL_PATTERN =
  /^https?:\/\/(www\.|m\.)?youtube\.com\/(@[^/?#]+|(channel|user|c)\/[^/?#]+)/i;

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
};

function isValidChannelId(channelId) {
  return typeof channelId === "string" && CHANNEL_ID_PATTERN.test(channelId);
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

async function resolveChannelId(source) {
  if (isValidChannelId(source.info.channelId)) {
    return source.info.channelId;
  }
  const channelIdFromUrl = extractChannelIdFromUrl(source.info.url);
  if (channelIdFromUrl) {
    return channelIdFromUrl;
  }
  const pageRaw = await fetchWithRetry(source.info.url, REQUEST_HEADERS);
  return extractChannelIdFromPage(pageRaw);
}

// eslint-disable-next-line no-undef
module.exports = {
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
      const channelId = await resolveChannelId(source);
      if (!channelId) {
        return null;
      }
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
        }`
      );
    }
    if (!channelId) {
      throw new Error(
        `Could not resolve YouTube channel ID for ${source.info.url}`
      );
    }
    const feed = parseFeed(
      await fetchWithRetry(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        REQUEST_HEADERS
      )
    );
    const sourceItems = [];
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
      try {
        await axios
          .get(`https://www.youtube.com/shorts/${item.id.split(":")[2]}`, {
            maxRedirects: 0,
          })
          .then(() => {
            sourceItem.title = `${sourceItem.title} (#shorts)`;
          });
      } catch (err) {
        // Not short
      }
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
