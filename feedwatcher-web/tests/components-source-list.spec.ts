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

  test("the root scope has a leading icon but no disclosure caret", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-tree-row");

    expect(rows).toHaveLength(4);
    expect(rows[0].classes()).toContain("source-tree-row-root");
    expect(rows[0].find(".source-tree-caret i").exists()).toBe(false);
    expect(rows[0].find(".source-tree-icon i").classes()).toContain(
      "bi-collection",
    );
    expect(rows[1].classes()).not.toContain("source-tree-row-root");
    expect(rows[1].find(".source-tree-icon").exists()).toBe(true);
    wrapper.unmount();
  });

  test("every row is indented by its hierarchy depth", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-tree-row");

    expect(rows.map((row) => row.attributes("data-tree-depth"))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(rows.map((row) => row.attributes("style"))).toEqual([
      "--tree-depth: 0;",
      "--tree-depth: 1;",
      "--tree-depth: 2;",
      "--tree-depth: 3;",
    ]);
    wrapper.unmount();
  });

  test("a label and a source at the same depth share the same indentation", async () => {
    const wrapper = mount(SourceList, { global: { plugins: [newPinia()] } });
    await flushPromises();
    SourcesStore().sources = [
      {
        isLabel: true,
        isRoot: true,
        depth: 0,
        labelName: "",
        displayName: "All",
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
        sourceId: "source-1",
        isLabel: false,
        isRoot: false,
        depth: 2,
        name: "Direct",
        displayName: "Direct",
        labelName: "cars",
        icon: "rss",
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
    ] as never[];
    await nextTick();

    const rows = wrapper.findAll(".source-tree-row");
    expect(rows[2].attributes("style")).toBe(rows[3].attributes("style"));
    expect(rows[2].attributes("data-tree-depth")).toBe("2");
    wrapper.unmount();
  });

  test("only labels get a disclosure caret", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-tree-row");

    expect(rows[1].find(".source-tree-caret i").exists()).toBe(true);
    expect(rows[2].find(".source-tree-caret i").exists()).toBe(true);
    expect(rows[3].find(".source-tree-caret i").exists()).toBe(false);
    wrapper.unmount();
  });

  test("labels show a folder icon and sources show their own icon", async () => {
    const wrapper = await mountWithSources();
    const rows = wrapper.findAll(".source-tree-row");

    expect(rows[1].find(".source-tree-icon i").classes()).toContain(
      "bi-folder2-open",
    );
    expect(rows[3].find(".source-tree-icon i").classes()).toContain(
      "bi-car-front",
    );
    wrapper.unmount();
  });
});
