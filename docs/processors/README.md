# Processors and Developing new Processors

A key concept of feedwatcher are processors. These are modules that can be added to hande new type of URL.

Built-in processors are stored in the [feedwatcher-server/processors-system](../../feedwatcher-server/processors-system/) of thise repository.

However, users can implement their own processors wihout changing the application.

Do do so you need to create a Javascript file in the `/opt/app/feedwatcher/processors-user` of the runtime container

Processors are used in alphabetical order. It is then recommended to name processors from the most specific to the more general.

The provided Javascript files need to follow the following structure:

```javascript
module.exports = {
  //
  getInfo: () => {
    return {
      title: "<NAME OF THE PROCESSOR>",
      description: "<SOME DESCRIPTION ABOUT THE PROCESSOR>",
      icon: "<A THE BOOTSTRAP ICON CODE>",
    };
  },

  test: async (source) => {
    let urlMatch = /.../.exec(source.info.url); // A REGEX TO TEST IF THE URL IS SUPPORTED
    if (urlMatch) {
      return { name: "<NAME FOR THE SOURCE>", icon: "<A THE BOOTSTRAP ICON CODE>" };
    }
    return null; // URL NOT SUPPORTED
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    // lastSourceItemSaved IS THE LAST ITEM KNOWN FOR THIS SOURCE

    // RETURN THE FOLLOWING ARRAY:
    const sourceItems = [
        {
            url = "<URL OF THE ITEM>",
            title = "TITLE OF THE ITEM",
            content = "TEXT OF THE ITEM",
            datePublished = new Date("<DATE OF THE ITEM>");
        },
        ...
    ];
    return sourceItems;
  },
};
```

It is recommenede to have a look at the existing [System Processors](../../feedwatcher-server/processors-system/).

## Fetching URLs safely

Bundled processors never call `axios` directly for user-provided URLs. They use the shared helper in [processors-system/lib/ssrf-http.js](../../feedwatcher-server/processors-system/lib/ssrf-http.js), which only allows `http`/`https`, rejects private/special-use addresses (unless `SOURCE_ALLOW_PRIVATE_NETWORK` is enabled), pins the validated IP for the connection, revalidates every redirect and caps the response size and timeout:

```javascript
const { fetchText } = require("../processors-system/lib/ssrf-http");

const response = await fetchText(source.info.url, {
  timeoutMs: 10000,
  maxContentLength: 5 * 1024 * 1024,
  allowedContentTypes: null,
});
```

User processors installed in `processors-user` can reuse the same helper through that relative path. The processor contract (`getInfo`/`test`/`fetchLatest`) is unchanged.

## Per-cycle fetch context

The scheduler calls processors with an optional third argument (second for `test`) that memoizes the feed download and its parsed form for the current source cycle:

```javascript
test: async (source, context) => { ... },

fetchLatest: async (source, lastSourceItemSaved, context) => {
  // One conditional GET per source cycle, shared with test()
  const feed = await context.getFeed(source.info.url, {
    timeoutMs: 10000,
    maxContentLength: 5 * 1024 * 1024,
  });
  ...
},
```

- `context.getFeed(url, options)` returns the parsed feed (`@rowanmanning/feed-parser`), reusing the HTTP response and parse result for that URL within the cycle.
- `ETag`/`Last-Modified` are persisted per source and sent back as `If-None-Match`/`If-Modified-Since` on the next cycle.
- On `304 Not Modified` it throws a `FeedNotModifiedError` (`err.name === "FeedNotModifiedError"`); the scheduler treats it as a successful fetch with no new items, without parsing the body.
- The scheduler passes an `AbortSignal` through the context, so a timeout cancels the HTTP request.

The extra argument is optional: processors that only need the older `test(source)` / `fetchLatest(source, last)` signatures keep working unchanged. `processors-system/700-PodcastProcessor.js` and `processors-system/800-RssProcessor.js` are reference implementations; the helper module is `processors-system/lib/feed-cache.js`.
