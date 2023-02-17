// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const _ = require("lodash");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "Wikipedia Page",
      description: "Follows edits a a Wikipedia page. <br/>" + "Expected URLs: https://hub.wikipedia.com/wiki/[page]",
      icon: "wikipedia",
    };
  },

  test: async (source) => {
    let urlMatch = /.*\/\/(.*)(\.m)?.wikipedia.org\/wiki\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    if (urlMatch) {
      const pageLanguage = urlMatch[1];
      const pageName = urlMatch[3];
      const pageInfo = (await axios.get(`https://${pageLanguage}.wikipedia.org/w/rest.php/v1/page/${pageName}/bare`))
        .data;
      return { name: pageInfo.title, icon: "wikipedia" };
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*\/\/(.*)(\.m?).wikipedia.org\/wiki\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    const pageLanguage = urlMatch[1];
    const pageName = urlMatch[3];
    const pageRevisions = _.sortBy(
      (await axios.get(`https://${pageLanguage}.wikipedia.org/w/rest.php/v1/page/${pageName}/history`)).data.revisions,
      ["timestamp"]
    );
    const sourceItems = [];
    for (let i = 0; i < pageRevisions.length; i++) {
      const item = pageRevisions[i];
      const sourceItem = {};
      sourceItem.url = source.info.url;
      sourceItem.title = item.comment.substring(0, 20);
      sourceItem.content = `Comment: <br/>${item.comment}<br>Author: ${item.user.name}<br />Change Size: ${item.delta}/${item.size}`;
      if (i > 0) {
        sourceItem.content += `<br />Difference: <a href="https://${pageLanguage}.wikipedia.org/w/index.php?title=${pageName}&diff=${
          item.id
        }&oldid=${pageRevisions[i - 1].id}" target="_blank">Link</a>`;
      }
      sourceItem.datePublished = new Date(item.timestamp);
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
