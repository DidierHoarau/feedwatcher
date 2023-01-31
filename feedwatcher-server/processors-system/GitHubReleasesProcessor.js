// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    const parser = new Parser();
    const feed = await parser.parseURL(source.info.url);
    if (feed.title) {
      return true;
    }
    return false;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const parser = new Parser();
    const feed = await parser.parseURL(source.info.url);
    const sourceItems = [];
    feed.items.forEach((item) => {
      const sourceItem = {};
      sourceItem.url = item.link;
      sourceItem.title = item.title;
      sourceItem.content = item.content;
      sourceItem.datePublished = new Date(item.pubDate);
      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
