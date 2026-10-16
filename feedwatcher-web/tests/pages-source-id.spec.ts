import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SourceIdPage from "~~/pages/sources/[sourceId].vue";
import SourceUrlFinder from "~~/components/SourceUrlFinder.vue";
import { SourcesStore } from "~~/stores/SourcesStore";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

// Nuxt auto-imports used by the page.
(globalThis as any).SourcesStore = SourcesStore;
(globalThis as any).UserProcessorInfoStore = () => ({ check: () => {} });
(globalThis as any).useRouter = () => ({ push: () => {} });

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SourceIdPage, {
    global: {
      mocks: { $route: { params: { sourceId: "source-1" } } },
      stubs: { LabelSelectDialog: true },
      plugins: [pinia],
    },
  });
  await flushPromises();
  return wrapper;
}

describe("Update Source page label handling (M18)", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/sources/source-1/labels")) {
        return Promise.resolve({ data: { labels: [{ name: "existing" }] } });
      }
      if (url.endsWith("/sources/source-1")) {
        return Promise.resolve({
          data: {
            id: "source-1",
            name: "My Source",
            info: { url: "https://example.com/feed" },
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  });

  test("selecting the same new label twice adds it only once", async () => {
    const wrapper = await mountPage();
    const vm = wrapper.vm as any;
    expect(vm.labels).toEqual([{ name: "existing" }]);

    await vm.onLabelSelected({ label: "news" });
    await vm.onLabelSelected({ label: "news" });

    expect(vm.labels).toEqual([{ name: "existing" }, { name: "news" }]);
    expect(vm.isSelectLabel).toBe(false);
  });

  test("selecting an already attached label does not duplicate it", async () => {
    const wrapper = await mountPage();
    const vm = wrapper.vm as any;

    await vm.onLabelSelected({ label: "existing" });

    expect(vm.labels).toEqual([{ name: "existing" }]);
  });

  test("removeLabel removes the matching label and addLabel opens the dialog", async () => {
    const wrapper = await mountPage();
    const vm = wrapper.vm as any;
    await vm.onLabelSelected({ label: "news" });

    vm.removeLabel({ name: "existing" });
    expect(vm.labels).toEqual([{ name: "news" }]);

    vm.addLabel();
    await flushPromises();
    expect(vm.isSelectLabel).toBe(true);
    expect(wrapper.html()).toContain("label-select-dialog-stub");
  });
});

describe("Update Source page URL handling", () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/sources/source-1/labels")) {
        return Promise.resolve({ data: { labels: [{ name: "existing" }] } });
      }
      if (url.endsWith("/sources/source-1")) {
        return Promise.resolve({
          data: {
            id: "source-1",
            name: "My Source",
            info: { url: "https://example.com/feed" },
          },
        });
      }
      if (url.endsWith("/sources/labels")) {
        return Promise.resolve({ data: { sourceLabels: [] } });
      }
      if (url.includes("/sources/labels/counts/")) {
        return Promise.resolve({ data: { counts: [] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.put).mockResolvedValue({});
    emitSpy = vi.spyOn(EventBus, "emit");
  });

  test("the URL input is rendered prefilled with the source url", async () => {
    const wrapper = await mountPage();
    const inputs = wrapper.findAll("input");
    expect((inputs[1].element as HTMLInputElement).value).toBe(
      "https://example.com/feed",
    );
  });

  test("updateSource sends the name, labels and edited url", async () => {
    const wrapper = await mountPage();
    const vm = wrapper.vm as any;
    vm.source.info.url = "https://example.com/new-feed";

    await vm.updateSource();
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/sources/source-1"),
      {
        name: "My Source",
        labels: ["existing"],
        url: "https://example.com/new-feed",
      },
      expect.anything(),
    );
  });

  test("updateSource with a missing url shows an error alert and does not send anything", async () => {
    const wrapper = await mountPage();
    const vm = wrapper.vm as any;
    vm.source.info.url = "";

    await vm.updateSource();
    await flushPromises();

    expect(emitSpy).toHaveBeenCalledWith(EventTypes.ALERT_MESSAGE, {
      type: "error",
      text: "URL missing",
    });
    expect(vi.mocked(axios.put)).not.toHaveBeenCalled();
  });
});

describe("Update Source page: guided recovery", () => {
  const FAILING_SOURCE = {
    id: "source-1",
    name: "My Source",
    health: "failing",
    info: {
      url: "https://example.com/dead-feed",
      lastFetchError: "Request failed with status code 404",
      lastFetchErrorClass: "permanent",
      fetchErrorCount: 7,
    },
  };

  function mockSourceApi(source: any, podcastSearchEnabled = false) {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/status")) {
        return Promise.resolve({ data: { podcastSearchEnabled } });
      }
      if (url.endsWith("/sources/source-1/labels")) {
        return Promise.resolve({ data: { labels: [] } });
      }
      if (url.endsWith("/sources/source-1")) {
        return Promise.resolve({ data: source });
      }
      if (url.endsWith("/sources/discover")) {
        return Promise.resolve({
          data: {
            feeds: [
              {
                url: "https://example.com/new-feed.xml",
                title: "New Feed",
                type: "application/rss+xml",
              },
            ],
          },
        });
      }
      if (url.endsWith("/sources/search")) {
        return Promise.resolve({
          data: {
            feeds: [
              {
                url: "https://podcast.example/feed.rss",
                title: "Found Podcast",
                author: "",
                image: "",
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.post).mockImplementation((url: string) => {
      if (url.endsWith("/sources/preview")) {
        return Promise.resolve({
          data: {
            processor: { title: "RSS Feed", icon: "rss" },
            name: "New Feed",
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
  }

  beforeEach(() => {
    mockSourceApi(FAILING_SOURCE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountWithFinder() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(SourceIdPage, {
      global: {
        mocks: { $route: { params: { sourceId: "source-1" } } },
        stubs: { LabelSelectDialog: true, Loading: true },
        components: { SourceUrlFinder },
        plugins: [pinia],
      },
    });
    await flushPromises();
    return wrapper;
  }

  async function confirmFinder(wrapper: any) {
    const finder = wrapper.findComponent({ name: "SourceUrlFinder" });
    await finder.find(".finder-candidate").trigger("click");
    await flushPromises();
    await finder.find(".finder-preview button").trigger("click");
    await flushPromises();
  }

  test("renders the plain-language diagnosis for a permanent failing source", async () => {
    const wrapper = await mountWithFinder();
    expect(wrapper.html()).toContain(
      "The source URL no longer works. Update the URL to recover.",
    );
    expect(wrapper.html()).toContain(
      "Last error: Request failed with status code 404",
    );
  });

  test("shows the guided URL finder below the url field", async () => {
    const wrapper = await mountWithFinder();
    expect(wrapper.html()).toContain("Find a working URL");
    expect(wrapper.findComponent({ name: "SourceUrlFinder" }).exists()).toBe(
      true,
    );
  });

  test("Use this URL fills the source url for the next update", async () => {
    const emitSpy = vi.spyOn(EventBus, "emit");
    const wrapper = await mountWithFinder();
    const vm = wrapper.vm as any;

    const finder = wrapper.findComponent({ name: "SourceUrlFinder" });
    await finder.find("input").setValue("https://example.com");
    await finder.findAll("button")[0].trigger("click");
    await flushPromises();

    await confirmFinder(wrapper);

    expect(vm.source.info.url).toBe("https://example.com/new-feed.xml");
    expect(emitSpy).toHaveBeenCalledWith(EventTypes.ALERT_MESSAGE, {
      type: "info",
      text: "URL updated — click Update to apply it",
    });
    expect(vi.mocked(axios.put)).not.toHaveBeenCalled();
  });

  test("re-points the source to a podcast found via search", async () => {
    mockSourceApi(FAILING_SOURCE, true);
    const wrapper = await mountWithFinder();

    const finder = wrapper.findComponent({ name: "SourceUrlFinder" });
    const searchInput = finder.find("input[type=search]");
    expect(searchInput.exists()).toBe(true);

    await searchInput.setValue("found");
    // The podcast search is debounced (400ms).
    await new Promise((resolve) => setTimeout(resolve, 450));
    await flushPromises();

    expect(finder.html()).toContain("Found Podcast");

    await confirmFinder(wrapper);

    expect((wrapper.vm as any).source.info.url).toBe(
      "https://podcast.example/feed.rss",
    );
  });
});
