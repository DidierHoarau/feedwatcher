// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    // eslint-disable-next-line no-undef
    if (!process.env.FEEDWATCHER_YOUTUBE_API_KEY) {
      return false;
    }
    let urlMatch = /.*youtube.com\/(.*)/.exec(source.info.url);
    if (urlMatch) {
      return true;
    }
    return false;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    // eslint-disable-next-line no-undef
    const youtubeApiKey = process.env.FEEDWATCHER_YOUTUBE_API_KEY;
    let pageRaw = (await axios.get(source.info.url)).data;
    pageRaw = pageRaw.substring(pageRaw.indexOf("channel_id=") + "channel_id=".length);
    const channelId = pageRaw.substring(0, pageRaw.indexOf('"'));
    const channelVideos = (
      await axios.get(
        `https://www.googleapis.com/youtube/v3/search?key=${youtubeApiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=20`
      )
    ).data.items;
    const sourceItems = [];
    for (const channelVideo of channelVideos) {
      const sourceItem = {};
      sourceItem.url = `https://www.youtube.com/watch?v=${channelVideo.id.videoId}`;
      sourceItem.title = channelVideo.snippet.title;
      sourceItem.content = channelVideo.snippet.description;
      sourceItem.datePublished = new Date(channelVideo.snippet.publishTime);
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
