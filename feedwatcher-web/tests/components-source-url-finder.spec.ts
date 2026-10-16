import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceUrlFinder from "~~/components/SourceUrlFinder.vue";

vi.mock("axios");

const DISCOVER_URL = "/api/sources/discover";
const PREVIEW_URL = "/api/sources/preview";
const SEARCH_URL = "/api/sources/search";

function mountFinder(props = {}) {
  return mount(SourceUrlFinder, {
    props: { confirmLabel: "Add", podcastSearchEnabled: false, ...props },
    global: { stubs: { Loading: true } },
  });
}

describe("SourceUrlFinder", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
  });

  test("renders discovery results and previews the selected feed", async () => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith(DISCOVER_URL)) {
        return Promise.resolve({
          data: {
            feeds: [
              {
                url: "https://example.com/feed.xml",
                title: "Example Feed",
                type: "application/rss+xml",
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.mocked(axios.post).mockImplementation((url: string) => {
      if (url.endsWith(PREVIEW_URL)) {
        return Promise.resolve({
          data: {
            processor: { title: "RSS Feed", icon: "rss" },
            name: "Example Feed",
            items: [
              {
                title: "Item 1",
                url: "https://example.com/1",
                datePublished: "2026-01-01T00:00:00Z",
                thumbnail: "",
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const wrapper = mountFinder();
    await wrapper.find("input").setValue("https://example.com");
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      expect.stringContaining(DISCOVER_URL),
      expect.objectContaining({ params: { url: "https://example.com" } }),
    );
    expect(wrapper.html()).toContain("Example Feed");

    await wrapper.find(".finder-candidate").trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      expect.stringContaining(PREVIEW_URL),
      { url: "https://example.com/feed.xml" },
      expect.anything(),
    );
    expect(wrapper.html()).toContain("RSS Feed");
    expect(wrapper.html()).toContain("Item 1");
    expect(wrapper.emitted("select")).toBeUndefined();

    await wrapper.find(".finder-preview button").trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      ["https://example.com/feed.xml", "Example Feed"],
    ]);
  });

  test("shows the discovery error when the endpoint fails", async () => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith(DISCOVER_URL)) {
        return Promise.reject({
          response: { data: { error: "Unsupported content type" } },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const wrapper = mountFinder();
    await wrapper.find("input").setValue("https://example.com");
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();

    expect(wrapper.html()).toContain("Unsupported content type");
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  test("searches podcasts and previews a result when enabled", async () => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith(SEARCH_URL)) {
        return Promise.resolve({
          data: {
            feeds: [
              {
                url: "https://podcast.example/feed.rss",
                title: "My Podcast",
                author: "Author",
                image: "",
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.mocked(axios.post).mockImplementation((url: string) => {
      if (url.endsWith(PREVIEW_URL)) {
        return Promise.resolve({
          data: {
            processor: { title: "Podcast", icon: "mic" },
            name: "My Podcast",
            items: [],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const wrapper = mountFinder({ podcastSearchEnabled: true });
    await wrapper.find("input[type=search]").setValue("my podcast");
    // The podcast search is debounced (400ms).
    await new Promise((resolve) => setTimeout(resolve, 450));
    await flushPromises();

    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      expect.stringContaining(SEARCH_URL),
      expect.objectContaining({ params: { q: "my podcast" } }),
    );
    expect(wrapper.html()).toContain("My Podcast");

    await wrapper.find(".finder-candidate").trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      expect.stringContaining(PREVIEW_URL),
      { url: "https://podcast.example/feed.rss" },
      expect.anything(),
    );

    await wrapper.find(".finder-preview button").trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      ["https://podcast.example/feed.rss", "My Podcast"],
    ]);
  });
});
