import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { nextTick } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceList from "~~/components/SourceList.vue";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";
import { SourcesStore } from "~~/stores/SourcesStore";

vi.mock("axios");

// The component calls Nuxt auto-imported store functions.
(globalThis as any).SourceItemsStore = SourceItemsStore;
(globalThis as any).SourcesStore = SourcesStore;

function newPinia() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

function mockLabelsApi() {
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.endsWith("/sources/labels")) {
      return Promise.resolve({ data: { sourceLabels: [] } });
    }
    if (url.endsWith("/counts/unread") || url.endsWith("/counts/saved")) {
      return Promise.resolve({ data: { counts: [] } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

async function mountWithSources() {
  const wrapper = mount(SourceList, { global: { plugins: [newPinia()] } });
  await flushPromises();

  const sourcesStore = SourcesStore();
  sourcesStore.sources = [
    {
      isLabel: true,
      isRoot: true,
      depth: 0,
      name: "All",
      displayName: "All",
      labelName: "",
      isCollapsed: false,
      isVisible: true,
    },
    {
      isLabel: true,
      isRoot: false,
      depth: 1,
      labelName: "cars",
      displayName: "cars",
      isCollapsed: false,
      isVisible: true,
    },
    {
      isLabel: true,
      isRoot: false,
      depth: 2,
      labelName: "cars/makes",
      displayName: "makes",
      isCollapsed: false,
      isVisible: true,
    },
    {
      sourceId: "source-1",
      isLabel: false,
      isRoot: false,
      depth: 3,
      name: "Autoblog",
      displayName: "Autoblog",
      labelName: "cars/makes",
      icon: "car-front",
      isVisible: true,
    },
  ] as never[];
  await nextTick();
  return wrapper;
}

describe("SourceList tree indentation", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    mockLabelsApi();
  });

  test("the root scope and top-level labels share the same indentation", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-name-layout");

    expect(rows).toHaveLength(4);
    expect(rows[0].attributes("style")).toContain("--tree-indent: 0");
    expect(rows[1].attributes("style")).toContain("--tree-indent: 0");
    wrapper.unmount();
  });

  test("nested labels and their sources step in by one level each", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-name-layout");

    expect(rows[2].attributes("style")).toContain("--tree-indent: 1");
    expect(rows[3].attributes("style")).toContain("--tree-indent: 2");
    wrapper.unmount();
  });

  test("the root scope has no disclosure caret while labels do", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-name-layout");

    expect(rows[0].find(".source-name-toggle i").exists()).toBe(false);
    expect(rows[1].find(".source-name-toggle i").exists()).toBe(true);
    expect(rows[3].find(".source-name-toggle i").exists()).toBe(false);
    wrapper.unmount();
  });

  test("labels show a folder icon and sources show their own icon", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-name-layout");

    expect(rows[1].find(".source-name-icon i").classes()).toContain(
      "bi-folder2-open",
    );
    expect(rows[3].find(".source-name-icon i").classes()).toContain(
      "bi-car-front",
    );
    expect(rows[0].find(".source-name-icon i").exists()).toBe(false);
    wrapper.unmount();
  });
});
