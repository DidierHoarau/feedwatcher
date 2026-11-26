// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SW_SOURCE = readFileSync(
  fileURLToPath(new URL("../public/sw.js", import.meta.url)),
  "utf8",
);

const ORIGIN = "https://app.example.com";
const MANIFEST_URL = `${ORIGIN}/_nuxt/builds/latest.json`;

function createHarness() {
  const listeners = new Map<string, any>();
  const stores = new Map<string, Map<string, any>>();

  const cacheFor = (name: string) => {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    return stores.get(name)!;
  };

  const cacheStorage = {
    open: vi.fn(async (name: string) => {
      const store = cacheFor(name);
      return {
        put: async (request: any, response: any) => {
          store.set(request.url, response);
        },
        match: async (request: any) => store.get(request.url),
        delete: async (request: any) => store.delete(request.url),
        keys: async () => Array.from(store.keys()).map((url) => new Request(url)),
        addAll: async () => {},
      };
    }),
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
    // Global lookup across all caches, like the Cache Storage API
    match: vi.fn(async (request: any) => {
      for (const store of stores.values()) {
        if (store.has(request.url)) return store.get(request.url);
      }
      return undefined;
    }),
  };

  const fetchMock = vi.fn();
  const sandbox: any = {
    self: {
      addEventListener: (type: string, handler: any) =>
        listeners.set(type, handler),
      skipWaiting: vi.fn(),
      clients: {
        claim: vi.fn(async () => {}),
        matchAll: vi.fn(async () => []),
        openWindow: vi.fn(async () => {}),
      },
      registration: { showNotification: vi.fn(async () => {}) },
    },
    location: { origin: ORIGIN },
    caches: cacheStorage,
    fetch: fetchMock,
    Response,
    Request,
    Headers,
    URL,
    console,
  };
  vm.runInNewContext(SW_SOURCE, sandbox);

  const dispatch = (type: string, event: any) => {
    const handler = listeners.get(type);
    if (!handler) throw new Error(`No ${type} listener registered`);
    handler(event);
  };

  return {
    stores,
    cacheStorage,
    fetchMock,
    sandbox,
    dispatchFetch: (request: any) => {
      let responded: Promise<any> | undefined;
      dispatch("fetch", { request, respondWith: (p: any) => (responded = p) });
      return responded;
    },
  };
}

describe("public/sw.js build manifest passthrough", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it("answers the build manifest from the network, never from the cache", async () => {
    harness.stores.set(
      "fw-v3-static",
      new Map([[MANIFEST_URL, new Response('{"id":"stale-build"}')]]),
    );
    harness.fetchMock.mockResolvedValueOnce(
      new Response('{"id":"fresh-build"}', { status: 200 }),
    );

    const response = await harness.dispatchFetch(new Request(MANIFEST_URL));

    expect(await response.text()).toBe('{"id":"fresh-build"}');
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    // The stale entry stays untouched
    expect(
      await harness.stores.get("fw-v3-static")!.get(MANIFEST_URL)?.text(),
    ).toBe('{"id":"stale-build"}');
  });

  it("never writes the build manifest to a cache", async () => {
    harness.fetchMock.mockResolvedValue(
      new Response('{"id":"fresh-build"}', { status: 200 }),
    );

    await harness.dispatchFetch(new Request(MANIFEST_URL));

    for (const store of harness.stores.values()) {
      expect(store.has(MANIFEST_URL)).toBe(false);
    }
  });

  it("still serves other /_nuxt/ assets cache-first", async () => {
    const assetUrl = `${ORIGIN}/_nuxt/entry.abc123.js`;
    harness.stores.set(
      "fw-v3-static",
      new Map([[assetUrl, new Response("cached entry", { status: 200 })]]),
    );
    harness.fetchMock.mockResolvedValue(
      new Response("network entry", { status: 200 }),
    );

    const response = await harness.dispatchFetch(new Request(assetUrl));

    expect(await response.text()).toBe("cached entry");
  });
});
