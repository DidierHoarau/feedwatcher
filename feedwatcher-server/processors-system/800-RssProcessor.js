// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "RSS Feed",
      description: "Follows a RSS feed. <br/>" + "Expected URLs: RSS or Atom feed URL",
      icon: "rss",
    };
  },

  test: async (source) => {
    try {
      const feed = await new Parser({
        timeout: 30000,
      }).parseURL(source.info.url);
      if (feed.title) {
        return { name: feed.title, icon: "rss" };
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const feed = await new Parser({
      timeout: 30000,
    }).parseURL(source.info.url);
    const sourceItems = [];
    feed.items.forEach((item) => {
      const sourceItem = {};
      sourceItem.url = item.link;
      sourceItem.title = item.title;
      sourceItem.content = item.content || "";
      sourceItem.datePublished = new Date(item.pubDate);
      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
