// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  test: async (source) => {
    let urlMatch = /.*hub.docker.com\/(r|_)\/(.*?)\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    if (urlMatch) {
      const repoUser = urlMatch[2] === "_" ? "library" : urlMatch[2];
      const repoImage = urlMatch[3];
      return { name: `DockerHub ${repoUser}/${repoImage}`, icon: "code" };
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /.*hub.docker.com\/(r|_)\/(.*?)\/(.*?)((\/\w+)+|\/?)$/.exec(source.info.url);
    const repoUser = urlMatch[2] === "_" ? "library" : urlMatch[2];
    const repoImage = urlMatch[3];
    let tags = (await axios.get(`https://hub.docker.com/v2/repositories/${repoUser}/${repoImage}/tags`)).data.results;
    const sourceItems = [];
    for (const item of tags) {
      const sourceItem = {};
      sourceItem.url = source.info.url;
      sourceItem.title = `${repoUser}/${repoImage}:${item.name}`;
      sourceItem.content =
        `Image: ${repoUser}/${repoImage}<br />` + `Tag: ${item.name}<br />` + `Size: ${item.full_size}<br />`;
      sourceItem.datePublished = new Date(item.tag_last_pushed);
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
