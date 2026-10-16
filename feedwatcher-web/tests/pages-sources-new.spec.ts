import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NewSourcePage from "~~/pages/sources/new.vue";
import { SourcesStore } from "~~/stores/SourcesStore";

vi.mock("axios");

// Nuxt auto-imports used by the page.
(globalThis as any).SourcesStore = SourcesStore;
const pushSpy = vi.fn();
(globalThis as any).useRouter = () => ({ push: pushSpy });

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(NewSourcePage, {
    global: {
      plugins: [pinia],
      stubs: { Loading: true },
    },
  });
  await flushPromises();
  return wrapper;
}

function mockStatusApi() {
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.endsWith("/status")) {
      return Promise.resolve({ data: { podcastSearchEnabled: false } });
    }
    if (url.endsWith("/sources/labels")) {
      return Promise.resolve({ data: { sourceLabels: [] } });
    }
    if (url.endsWith("/counts/unread") || url.endsWith("/counts/saved")) {
      return Promise.resolve({ data: { counts: [] } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

describe("New Source page: add by URL", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    pushSpy.mockReset();
    mockStatusApi();
  });

  test("adds a source by exact url", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: "source-9" } });

    const wrapper = await mountPage();
    await wrapper.find("input").setValue("https://example.com/feed.xml");
    const addButtons = wrapper
      .findAll("button")
      .filter((b) => b.text() === "Add");
    await addButtons[0].trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      expect.stringContaining("/api/sources"),
      { url: "https://example.com/feed.xml" },
      expect.anything(),
    );
    expect(pushSpy).toHaveBeenCalledWith("/sources/source-9");
  });

  test("warns when the source already exists", async () => {
    const wrapper = await mountPage();
    const sourcesStore = SourcesStore();
    sourcesStore.sources = [
      {
        sourceId: "source-1",
        isLabel: false,
        isRoot: false,
        depth: 1,
        name: "Existing",
        displayName: "Existing",
        labelName: "",
        sourceInfo: { url: "https://example.com/feed.xml" },
      },
    ] as never[];
    await flushPromises();

    await wrapper.find("input").setValue("https://example.com/feed.xml");

    expect(wrapper.html()).toContain("This source already exists");
  });
});

describe("New Source page: feed discovery", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    pushSpy.mockReset();
    mockStatusApi();
  });

  test("discovers feeds, previews and adds the selected feed url", async () => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/sources/discover")) {
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
      if (url.endsWith("/sources/preview")) {
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
      return Promise.resolve({ data: { id: "source-9" } });
    });

    const wrapper = await mountPage();

    // The finder is hidden until "Find feeds" is clicked.
    let finder = wrapper.findComponent({ name: "SourceUrlFinder" });
    expect(finder.exists()).toBe(false);
    const toggle = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("Find feeds"))[0];
    await toggle.trigger("click");

    finder = wrapper.findComponent({ name: "SourceUrlFinder" });
    await finder.find("input").setValue("https://example.com");
    await finder.findAll("button")[0].trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      expect.stringContaining("/sources/discover"),
      expect.objectContaining({ params: { url: "https://example.com" } }),
    );
    expect(finder.html()).toContain("Example Feed");

    await finder.find(".finder-candidate").trigger("click");
    await flushPromises();
    expect(finder.html()).toContain("Item 1");

    await finder.find(".finder-preview button").trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      expect.stringContaining("/api/sources"),
      { url: "https://example.com/feed.xml" },
      expect.anything(),
    );
    expect(pushSpy).toHaveBeenCalledWith("/sources/source-9");
  });
});
