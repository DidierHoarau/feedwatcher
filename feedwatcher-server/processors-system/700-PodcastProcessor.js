// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const { parseFeed } = require("@rowanmanning/feed-parser");

/**
 * Extract the audio enclosure URL from a feed item's raw XML element.
 * Only returns a URL if the enclosure is an audio type (type="audio/...").
 * Falls back to checking the URL extension if the type attribute is missing.
 */
function getEnclosureUrl(item) {
  const enclosure = item.element.findElementWithName("enclosure");
  if (!enclosure) return null;

  const type = enclosure.getAttribute("type") || "";
  const url = enclosure.getAttribute("url") || "";

  // Explicit audio MIME type
  if (type.startsWith("audio/")) return url || null;

  // If type is present but not audio (e.g. video/, image/), skip
  if (type && !type.startsWith("audio/")) return null;

  // No type attribute — check URL extension as fallback
  if (url && /\.(mp3|m4a|ogg|opus|wav|flac|aac)(\?|$)/i.test(url)) {
    return url;
  }

  return null;
}

/**
 * Extract an itunes-namespaced element's text content.
 * e.g. getItunesValue(item, "duration") reads <itunes:duration>.
 */
function getItunesValue(element, localName) {
  const child = element.findElementWithName(localName);
  if (child && child.namespace === "itunes") {
    return child.textContent || null;
  }
  // Fallback: if namespace is not preserved, still return if found
  if (child) {
    return child.textContent || null;
  }
  return null;
}

/**
 * Get the itunes:image URL from an element (feed or item level).
 */
function getItunesImageUrl(element) {
  const itunesImage = element.findElementWithName("image");
  if (itunesImage && itunesImage.namespace === "itunes") {
    return itunesImage.getAttribute("href") || null;
  }
  // Fallback when namespace is stripped
  if (itunesImage) {
    const href = itunesImage.getAttribute("href");
    if (href) return href;
  }
  return null;
}

/**
 * Check if a feed is a podcast (has audio enclosures).
 * Only counts enclosures with audio MIME types or audio file extensions.
 */
function isPodcastFeed(feed) {
  if (!feed.items || feed.items.length === 0) return false;
  return feed.items.some((item) => {
    return getEnclosureUrl(item) !== null;
  });
}

// eslint-disable-next-line no-undef
module.exports = {
  getInfo: () => {
    return {
      title: "Podcast",
      description:
        "Follows a podcast RSS feed and plays audio episodes.<br/>Expected URLs: podcast RSS feed URL",
      icon: "headphones",
    };
  },

  test: async (source) => {
    try {
      const feed = parseFeed((await axios.get(source.info.url)).data);
      if (!isPodcastFeed(feed)) {
        return null;
      }
      const artwork =
        getItunesImageUrl(feed.element) ||
        (feed.image && feed.image.url) ||
        null;
      return { name: feed.title, icon: "headphones", artwork };
    } catch (err) {
      return null;
    }
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const feed = parseFeed((await axios.get(source.info.url)).data);
    const feedArtwork =
      getItunesImageUrl(feed.element) || (feed.image && feed.image.url) || null;
    const feedAuthor = getItunesValue(feed.element, "author");

    const sourceItems = [];
    feed.items.forEach((item) => {
      const audioUrl = getEnclosureUrl(item);
      // Only include items that have an audio enclosure
      if (!audioUrl) return;

      const sourceItem = {};
      // Use the episode webpage URL only; never fall back to audio URL here
      // (audio URL is stored separately in info.audioUrl)
      if (item.url) {
        sourceItem.url = item.url;
      } else {
        sourceItem.url = "";
      }
      sourceItem.title = item.title || "Untitled Episode";
      sourceItem.content = item.content || item.description || "";
      sourceItem.datePublished = new Date(item.published);
      sourceItem.thumbnail =
        (item.image && item.image.url) ||
        getItunesImageUrl(item.element) ||
        feedArtwork;

      // Podcast-specific metadata stored in info
      const itemAuthor = getItunesValue(item.element, "author") || feedAuthor;
      const itemDuration = getItunesValue(item.element, "duration");
      const itemSubtitle = getItunesValue(item.element, "subtitle");
      const itemSummary = getItunesValue(item.element, "summary");

      sourceItem.info = {
        isPodcast: true,
        audioUrl: audioUrl,
        artwork:
          getItunesImageUrl(item.element) ||
          (item.image && item.image.url) ||
          feedArtwork,
        duration: itemDuration,
        author: itemAuthor,
        subtitle: itemSubtitle,
        summary: itemSummary,
      };

      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
