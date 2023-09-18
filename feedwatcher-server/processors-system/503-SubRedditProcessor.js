// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "Sub-Reddit",
      description: "Follows posts from a subreddit. <br/>" + "Expected URLs: https://reddit.com/r/[subreddit]",
      icon: "reddit",
    };
  },

  test: async (source) => {
    let urlMatch = /.*reddit.com\/r\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    if (urlMatch) {
      const subReddit = urlMatch[1];
      const feed = await new Parser({
        timeout: 30000,
      }).parseURL(`https://www.reddit.com/r/${subReddit}.rss`);
      if (feed.title) {
        return { name: feed.title, icon: "reddit" };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*reddit.com\/r\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    const subReddit = urlMatch[1];
    const feed = await new Parser({
      timeout: 30000,
    }).parseURL(`https://www.reddit.com/r/${subReddit}.rss`);
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
