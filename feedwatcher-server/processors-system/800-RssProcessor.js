// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseFeed } = require("@rowanmanning/feed-parser");
const { fetchText } = require("./lib/ssrf-http");

const FETCH_TIMEOUT_MS = 10000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "RSS Feed",
      description:
        "Follows an RSS feed. <br/>Expected URLs: RSS or Atom feed URL",
      icon: "rss",
    };
  },

  test: async (source) => {
    try {
      const feed = parseFeed(
        (
          await fetchText(source.info.url, {
            timeoutMs: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_FEED_BYTES,
            allowedContentTypes: null,
          })
        ).data,
      );
      if (feed.title) {
        return { name: feed.title, icon: "rss" };
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const feed = parseFeed(
      (
        await fetchText(source.info.url, {
          timeoutMs: FETCH_TIMEOUT_MS,
          maxContentLength: MAX_FEED_BYTES,
          allowedContentTypes: null,
        })
      ).data,
    );
    const fetchTime = new Date();
    const sourceItems = [];
    feed.items.forEach((item) => {
      // Fall back to the guid when the feed item has no link; without either
      // the item cannot be opened or deduplicated, so skip it.
      const url = item.url || item.id;
      if (!url) {
        return;
      }
      const published = item.published ? new Date(item.published) : null;
      const hasValidDate = published && !isNaN(published.getTime());
      const sourceItem = {};
      sourceItem.url = url;
      sourceItem.title = item.title;
      sourceItem.content = item.content || item.description || "";
      // Date-less or invalid dates fall back to the fetch time instead of
      // epoch, so fresh items sort sensibly; url-based dedupe keeps
      // re-fetched items from accumulating.
      sourceItem.datePublished = hasValidDate ? published : fetchTime;
      sourceItem.thumbnail = item.image ? item.image.url : null;
      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
