// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "GitHub Releases",
      description: "Follows the GitHub of a repository. <br/>" + "Expected URLs: https://github.com/[user]/[repo]",
      icon: "github",
    };
  },

  test: async (source) => {
    let urlMatch = /.*github.com\/(.*)\/(.*)/.exec(source.info.url);
    if (!urlMatch) {
      return null;
    }
    const repo = urlMatch[2];
    return { name: repo, icon: "github" };
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
