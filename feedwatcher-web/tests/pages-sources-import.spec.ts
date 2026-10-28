import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ImportPage from "~~/pages/sources/import.vue";
import { SourcesStore } from "~~/stores/SourcesStore";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

(globalThis as any).SourcesStore = SourcesStore;
(globalThis as any).SourceItemsStore = () => ({
  sourceItems: [],
  fetch: vi.fn(),
});
(globalThis as any).UserProcessorInfoStore = () => ({
  status: "idle",
  fetch: vi.fn(),
});

const IMPORTED_SOURCES = [
  {
    name: "Alpha News",
    info: { url: "https://newsletter.example/rss/alpha.token" },
    labels: ["Newsletters"],
    existingSourceId: "source-1",
  },
  {
    name: "Feed B",
    info: { url: "https://b.example/feed.xml" },
    labels: ["Tech"],
  },
];

function mockApi(options: {
  sources?: any[];
  existing?: any[];
  importError?: any;
} = {}) {
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.endsWith("/sources/labels")) {
      return Promise.resolve({ data: { sourceLabels: [] } });
    }
    if (url.endsWith("/counts/unread") || url.endsWith("/counts/saved")) {
      return Promise.resolve({ data: { counts: [] } });
    }
    if (url.endsWith("/sources")) {
      return Promise.resolve({ data: { sources: options.existing || [] } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.mocked(axios.post).mockImplementation((url: string) => {
    if (url.includes("/sources/import/analyze/opml")) {
      return Promise.resolve({
        data: { sources: options.sources || IMPORTED_SOURCES },
      });
    }
    if (options.importError) {
      return Promise.reject(options.importError);
    }
    return Promise.resolve({ data: { id: "source-9" } });
  });
  vi.mocked(axios.put).mockResolvedValue({ data: {} } as any);
}

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ImportPage, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

async function uploadOpml(wrapper: any) {
  const input = wrapper.find('input[type="file"]');
  const file = new File(["<opml/>"], "feeds.opml", { type: "text/xml" });
  Object.defineProperty(input.element, "files", {
    value: [file],
    configurable: true,
  });
  await input.trigger("change");
  await flushPromises();
}

function importButton(wrapper: any) {
  return wrapper
    .findAll("button")
    .find((button: any) => button.text().includes("Import Selected"));
}

describe("Sources import page", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.put).mockReset();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  test("marks a source matched by feed id as already imported", async () => {
    mockApi();
    const wrapper = await mountPage();
    await uploadOpml(wrapper);

    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].attributes("disabled")).toBeDefined();
    expect(checkboxes[1].attributes("disabled")).toBeUndefined();

    const emitSpy = vi.spyOn(EventBus, "emit");
    await importButton(wrapper).trigger("click");
    await flushPromises();

    const importedPosts = vi
      .mocked(axios.post)
      .mock.calls.filter(([url]) => !String(url).includes("/analyze/opml"));
    expect(importedPosts).toHaveLength(1);
    expect(importedPosts[0][0]).toContain("/api/sources");
    expect(importedPosts[0][1]).toEqual({ url: "https://b.example/feed.xml" });
    expect(emitSpy).toHaveBeenCalledWith(
      EventTypes.ALERT_MESSAGE,
      expect.objectContaining({ text: "Imported: 1 ; Failed: 0 ; Skipped: 1" }),
    );
    emitSpy.mockRestore();
    wrapper.unmount();
  });

  test("treats a 409 on import as already imported", async () => {
    mockApi({
      sources: [IMPORTED_SOURCES[1]],
      importError: { response: { status: 409 } },
    });
    const wrapper = await mountPage();
    await uploadOpml(wrapper);

    expect(
      wrapper.findAll('input[type="checkbox"]')[0].attributes("disabled"),
    ).toBeUndefined();

    await importButton(wrapper).trigger("click");
    await flushPromises();

    expect(
      wrapper.findAll('input[type="checkbox"]')[0].attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.find(".bi-check-circle").exists()).toBe(true);
    wrapper.unmount();
  });
});
