// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "CoinGecko",
      description:
        "Get a price of a crypto currency once per day. <br/>" +
        "Expected URLs: https://www.coingecko.com/en/coins/[coin]",
      icon: "coin",
    };
  },

  test: async (source) => {
    let urlMatch = /.*coingecko.com\/en\/coins\/(.+)(\??).*/.exec(source.info.url);
    if (urlMatch) {
      const coin = urlMatch[1];
      const info = (await axios.get(`https://api.coingecko.com/api/v3/coins/${coin}`)).data;
      if (info.name) {
        return { name: `${info.name} (${info.symbol})`, icon: "coin" };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*coingecko.com\/en\/coins\/(.+)(\??).*/.exec(source.info.url);
    const coin = urlMatch[1];
    const info = (await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`)).data;
    let value = info[coin].usd;
    if (lastSourceItemSaved && new Date() - new Date(lastSourceItemSaved.datePublished) < 24 * 3600 * 1000) {
      return [];
    }
    const sourceItems = [];
    const sourceItem = {};
    sourceItem.url = source.info.url;
    sourceItem.title = `Price: USD ${value}`;
    if (lastSourceItemSaved && value > lastSourceItemSaved.info.price) {
      sourceItem.title += " (up)";
    } else if (lastSourceItemSaved && value < lastSourceItemSaved.info.price) {
      sourceItem.title += " (down)";
    }
    sourceItem.content = "";
    sourceItem.datePublished = new Date();
    sourceItem.info = { price: value };
    sourceItems.push(sourceItem);
    return sourceItems;
  },
};
