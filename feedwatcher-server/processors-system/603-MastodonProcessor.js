// eslint-disable-next-line @typescript-eslint/no-var-requires
const _ = require("lodash");
const net = require("net");
const sanitizeHtml = require("sanitize-html");
const { fetchText } = require("./lib/ssrf-http");

const FETCH_TIMEOUT_MS = 30000;

// A handle is @username@instance. The instance must be a plain DNS name: no
// scheme, port, path or credentials, so it can never redirect the request to
// another host or an internal address.
function parseHandle(raw) {
  const match = /^@([A-Za-z0-9_.-]+)@([A-Za-z0-9.-]+)$/.exec(
    String(raw || "").trim(),
  );
  if (!match) {
    return null;
  }
  const instance = match[2].toLowerCase();
  if (net.isIP(instance)) {
    return null;
  }
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      instance,
    )
  ) {
    return null;
  }
  return { username: match[1], instance };
}

async function fetchJson(url) {
  const response = await fetchText(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    allowedContentTypes: ["application/json"],
  });
  return JSON.parse(response.data);
}

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
    const handle = parseHandle(source.info.url);
    if (!handle) {
      return null;
    }
    const { username, instance } = handle;
    if (source.info.accountId) {
      return source.info;
    }
    const accountSearch = await fetchJson(
      `https://${instance}/api/v2/search?q=${encodeURIComponent(username)}`,
    );
    const account = _.find(accountSearch.accounts, { username });
    if (account) {
      const accountId = String(account.id);
      if (!/^[0-9]+$/.test(accountId)) {
        return null;
      }
      const userInfo = await fetchJson(
        `https://${instance}/api/v1/accounts/${accountId}`,
      );
      if (userInfo.display_name) {
        return {
          name: `${userInfo.display_name} @${username}@${instance}`,
          icon: "mastodon",
          accountId,
        };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const handle = parseHandle(source.info.url);
    if (!handle) {
      throw new Error(`Invalid Mastodon handle: ${source.info.url}`);
    }
    const accountId = String(source.info.accountId || "");
    if (!/^[0-9]+$/.test(accountId)) {
      throw new Error("Invalid Mastodon account ID");
    }
    const posts = await fetchJson(
      `https://${handle.instance}/api/v1/accounts/${accountId}/statuses`,
    );
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
