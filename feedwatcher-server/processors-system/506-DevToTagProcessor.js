// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    // eslint-disable-next-line no-undef
    let urlMatch = /.*dev.to\/t\/(.*)/.exec(source.info.url);
    if (urlMatch) {
      const feed = await new Parser().parseURL(`https://dev.to/feed/tag/${urlMatch[1]}`);
      if (feed.title) {
        return { name: feed.title, icon: "code" };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    // eslint-disable-next-line no-undef
    let urlMatch = /.*dev.to\/t\/(.*)/.exec(source.info.url);
    const feed = await new Parser().parseURL(`https://dev.to/feed/tag/${urlMatch[1]}`);
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
