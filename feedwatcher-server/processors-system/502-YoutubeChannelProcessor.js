// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    // eslint-disable-next-line no-undef
    let urlMatch = /.*youtube.com\/(.*)/.exec(source.info.url);
    if (urlMatch) {
      let pageRaw = (await axios.get(source.info.url)).data;
      pageRaw = pageRaw.substring(pageRaw.indexOf("channel_id=") + "channel_id=".length);
      const channelId = pageRaw.substring(0, pageRaw.indexOf('"'));
      const feed = await new Parser().parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      if (feed.title) {
        return { name: feed.title, icon: "youtube", channelId };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    // eslint-disable-next-line no-undef
    let channelId = "";
    if (source.info.channelId) {
      channelId = source.info.channelId;
    } else {
      let pageRaw = (await axios.get(source.info.url)).data;
      pageRaw = pageRaw.substring(pageRaw.indexOf("channel_id=") + "channel_id=".length);
      channelId = pageRaw.substring(0, pageRaw.indexOf('"'));
    }
    const feed = await new Parser().parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const sourceItems = [];
    feed.items.forEach((item) => {
      const sourceItem = {};
      sourceItem.url = item.link;
      sourceItem.title = item.title;
      sourceItem.content = item.content || "";
      sourceItem.content += `<iframe width="560" height="315" src="${item.link}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      sourceItem.datePublished = new Date(item.pubDate);
      sourceItems.push(sourceItem);
    });
    return sourceItems;
  },
};
