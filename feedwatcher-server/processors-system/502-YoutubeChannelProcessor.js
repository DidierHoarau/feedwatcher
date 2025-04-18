// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const { parseFeed } = require("@rowanmanning/feed-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "YouTube Channel",
      description: "Follows uploads from a YouTube channel. <br/>" + "Expected URLs: a channel url or a user url",
      icon: "youtube",
    };
  },

  test: async (source) => {
    // eslint-disable-next-line no-undef
    let urlMatch = /.*youtube.com\/(.*)/.exec(source.info.url);
    if (urlMatch) {
      let pageRaw = (await axios.get(source.info.url)).data;
      pageRaw = pageRaw.substring(pageRaw.indexOf("channel_id=") + "channel_id=".length);
      const channelId = pageRaw.substring(0, pageRaw.indexOf('"'));
      const feed = parseFeed(
        (await axios.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)).data
      );
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
    const feed = parseFeed((await axios.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)).data);
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
