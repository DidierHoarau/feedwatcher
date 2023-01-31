// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    let urlMatch = /.*github.com\/(.*)\/(.*)/.exec(source.info.url);
    if (urlMatch) {
      return true;
    }
    return false;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*github.com\/(.*)\/(.*)/.exec(source.info.url);
    const user = urlMatch[1];
    const repo = urlMatch[2];
    const releases = (await axios.get(`https://api.github.com/repos/${user}/${repo}/releases`)).data;
    const sourceItems = [];
    for (const release of releases) {
      const sourceItem = {};
      sourceItem.url = release.html_url;
      sourceItem.title = `${user}/${repo}: ${release.name}`;
      sourceItem.content = release.body;
      sourceItem.datePublished = new Date(release.created_at);
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
