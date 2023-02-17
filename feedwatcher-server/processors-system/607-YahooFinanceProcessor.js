// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require("rss-parser");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "Yahoo Finance",
      description: "Get a stock price per day. <br/>" + "Expected URLs: https://finance.yahoo.com/quote/[code]",
      icon: "coin",
    };
  },

  test: async (source) => {
    // eslint-disable-next-line no-undef
    let urlMatch = /.*finance.yahoo.com\/quote\/(.*)(\?.*?)/.exec(source.info.url);
    if (urlMatch) {
      let pageRaw = (await axios.get(source.info.url)).data;
      const code = urlMatch[1];
      const title = pageRaw.split("<title>")[1].split("</title>")[0].split(" Stock Price")[0];
      let value;
      const dataPoints = pageRaw.split("<fin-streamer ");
      for (const dataPoint of dataPoints) {
        if (dataPoint.indexOf("regularMarketPrice") > 0 && dataPoint.indexOf(`data-symbol="${code}"`) > 0) {
          value = dataPoint.split('value="')[1].split('"')[0];
        }
      }
      return { name: title, icon: "coin" };
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*finance.yahoo.com\/quote\/(.*)(\?.*?)/.exec(source.info.url);
    let pageRaw = (await axios.get(source.info.url)).data;
    const code = urlMatch[1];
    let value;
    const dataPoints = pageRaw.split("<fin-streamer ");
    for (const dataPoint of dataPoints) {
      if (dataPoint.indexOf("regularMarketPrice") > 0 && dataPoint.indexOf(`data-symbol="${code}"`) > 0) {
        value = dataPoint.split('value="')[1].split('"')[0];
      }
    }
    if (lastSourceItemSaved && new Date() - new Date(lastSourceItemSaved.datePublished) < 24 * 3600 * 1000) {
      return [];
    }
    const sourceItems = [];
    const sourceItem = {};
    sourceItem.url = source.info.url;
    sourceItem.title = `Price: ${value}`;
    if (lastSourceItemSaved && value > lastSourceItemSaved.info.price) {
      sourceItem.title += " 🡩";
    } else if (lastSourceItemSaved && value < lastSourceItemSaved.info.price) {
      sourceItem.title += " 🡫";
    }
    sourceItem.content = "";
    sourceItem.datePublished = new Date();
    sourceItem.info = { price: value };
    sourceItems.push(sourceItem);
    return sourceItems;
  },
};
