// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const { parseFeed } = require("@rowanmanning/feed-parser");

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
      const feed = parseFeed((await axios.get(source.info.url)).data);
      if (feed.title) {
        return { name: feed.title, icon: "rss" };
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const feed = parseFeed((await axios.get(source.info.url)).data);
    const sourceItems = [];
    feed.items.forEach((item) => {
      const sourceItem = {};
      sourceItem.url = item.url;
      sourceItem.title = item.title;
      sourceItem.content = item.content || "";
      sourceItem.datePublished = new Date(item.updated);
      sourceItem.thumbnail = item.image ? item.image.url : null;
      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
