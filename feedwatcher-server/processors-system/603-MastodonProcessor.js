// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
const _ = require("lodash");
const sanitizeHtml = require("sanitize-html");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "Mastodon",
      description:
        "Follow the post of a public Mastodon account<br/>" + "Expected URLs: the user handle: @[user]@[instance]",
      icon: "mastodon",
    };
  },

  test: async (source) => {
    let urlMatch = /@(.*)@(.*)/.exec(source.info.url);
    if (urlMatch) {
      const instance = urlMatch[2];
      const username = urlMatch[1];
      if (source.info.accountId) {
        return source.info;
      }
      const accountSearch = (await axios.get(`https://${instance}/api/v2/search?q=${username}`, { timeout: 30000 }))
        .data;
      const account = _.find(accountSearch.accounts, { username });
      if (account) {
        const accountId = account.id;
        const userInfo = (await axios.get(`https://${instance}/api/v1/accounts/${accountId}`, { timeout: 30000 })).data;
        if (userInfo.display_name) {
          return {
            name: `${userInfo.display_name} @${username}@${instance}`,
            icon: "mastodon",
            accountId,
          };
        }
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    let urlMatch = /@(.*)@(.*)/.exec(source.info.url);
    const instance = urlMatch[2];
    const posts = (
      await axios.get(`https://${instance}/api/v1/accounts/${source.info.accountId}/statuses`, { timeout: 30000 })
    ).data;
    const sourceItems = [];
    for (const item of posts) {
      const sourceItem = {};
      sourceItem.url = item.url;
      let content = "";
      if (item.reblog) {
        content += `[Reblog] ${item.reblog.content}`;
      } else {
        content += item.content;
      }
      sourceItem.content = content;
      let title = sanitizeHtml(content, {
        allowedTags: [],
        allowedAttributes: {},
      });
      if (title.length > 100) {
        title = title.substring(0, 100) + "...";
      }
      sourceItem.title = title;
      sourceItem.datePublished = new Date(item.created_at);
      sourceItems.push(sourceItem);
    }
    return sourceItems;
  },
};
