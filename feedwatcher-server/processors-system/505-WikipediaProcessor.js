// eslint-disable-next-line @typescript-eslint/no-var-requires
const _ = require("lodash");
const { fetchText } = require("./lib/ssrf-http");

const FETCH_TIMEOUT_MS = 30000;

const headers = {
  "User-Agent":
    "FeedWatcher/0.1.0 (https://github.com/DidierHoarau/feedwatcher)",
};

// Extracts the language and page name from a Wikipedia URL. The host must be
// an actual Wikipedia hostname: the language is looked up from the parsed URL,
// never from arbitrary text matched anywhere in the input, so URLs such as
// https://attacker.com/.wikipedia.org/wiki/X are rejected.
function parseWikipediaUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  const match = /^([a-z0-9-]{2,12})\.(?:m\.)?wikipedia\.org$/.exec(
    url.hostname.toLowerCase(),
  );
  if (!match) {
    return null;
  }
  if (!url.pathname.startsWith("/wiki/")) {
    return null;
  }
  const pageName = url.pathname.slice("/wiki/".length);
  if (!pageName) {
    return null;
  }
  return { pageLanguage: match[1], pageName };
}

async function fetchJson(url) {
  const response = await fetchText(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    allowedContentTypes: ["application/json"],
    headers,
  });
  return JSON.parse(response.data);
}

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    return {
      title: "Wikipedia Page",
      description:
        "Follows edits a a Wikipedia page. <br/>" +
        "Expected URLs: https://hub.wikipedia.com/wiki/[page]",
      icon: "wikipedia",
    };
  },

  test: async (source) => {
    const page = parseWikipediaUrl(source.info.url);
    if (!page) {
      return null;
    }
    const pageInfo = await fetchJson(
      `https://${page.pageLanguage}.wikipedia.org/w/rest.php/v1/page/${page.pageName}/bare`,
    );
    return { name: pageInfo.title, icon: "wikipedia" };
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    const page = parseWikipediaUrl(source.info.url);
    if (!page) {
      throw new Error(`Invalid Wikipedia URL: ${source.info.url}`);
    }
    const { pageLanguage, pageName } = page;
    const pageHistory = await fetchJson(
      `https://${pageLanguage}.wikipedia.org/w/rest.php/v1/page/${pageName}/history`,
    );
    const pageRevisions = _.sortBy(pageHistory.revisions, ["timestamp"]);
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
