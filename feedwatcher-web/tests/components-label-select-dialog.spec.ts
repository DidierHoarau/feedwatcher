import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import LabelSelectDialog from "~~/components/LabelSelectDialog.vue";
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

describe("LabelSelectDialog (M18)", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    mockLabelsApi();
  });

  test("selectLabel emits the typed label without touching the selection", async () => {
    const wrapper = mount(LabelSelectDialog, {
      global: { plugins: [newPinia()] },
    });
    await flushPromises();

    const sourcesStore = SourcesStore();
    const indexBefore = sourcesStore.selectedIndex;

    await wrapper.find("input").setValue("news");
    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.emitted("onLabelSelected")).toEqual([[{ label: "news" }]]);
    expect(sourcesStore.selectedIndex).toBe(indexBefore);
  });

  test("clicking a label row fills the input and selects it", async () => {
    const wrapper = mount(LabelSelectDialog, {
      global: { plugins: [newPinia()] },
    });
    await flushPromises();

    const sourcesStore = SourcesStore();
    sourcesStore.sources = [
      {
        isLabel: true,
        isRoot: false,
        depth: 1,
        hasChildren: true,
        labelName: "news",
        displayName: "news",
        isCollapsed: false,
        isVisible: true,
      },
    ] as never[];
    await flushPromises();

    await wrapper.find(".source-tree-name").trigger("click");

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
      "news",
    );
    expect(sourcesStore.selectedIndex).toBe(0);
  });

  test("renders labels with the same tree layout as the source list", async () => {
    const wrapper = mount(LabelSelectDialog, {
      global: { plugins: [newPinia()] },
    });
    await flushPromises();

    const sourcesStore = SourcesStore();
    sourcesStore.sources = [
      {
        isLabel: true,
        isRoot: true,
        depth: 0,
        hasChildren: true,
        labelName: "",
        displayName: "All",
        isCollapsed: false,
        isVisible: true,
      },
      {
        isLabel: true,
        isRoot: false,
        depth: 1,
        hasChildren: true,
        labelName: "news",
        displayName: "news",
        isCollapsed: false,
        isVisible: true,
      },
      {
        isLabel: true,
        isRoot: false,
        depth: 2,
        hasChildren: true,
        labelName: "news/tech",
        displayName: "tech",
        isCollapsed: false,
        isVisible: true,
      },
    ] as never[];
    await flushPromises();

    const rows = wrapper.findAll(".source-tree-row");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.attributes("data-tree-depth"))).toEqual([
      "1",
      "2",
    ]);
    expect(rows.map((row) => row.attributes("style"))).toEqual([
      "--tree-depth: 1;",
      "--tree-depth: 2;",
    ]);
    expect(wrapper.findAll(".source-tree-guide")).toHaveLength(0);
    // The picker has no toggle handler, so it never shows disclosure carets.
    expect(rows[0].find(".source-tree-caret").exists()).toBe(false);
    expect(rows[1].find(".source-tree-caret").exists()).toBe(false);
    expect(rows[0].find(".source-tree-icon i").classes()).toContain(
      "bi-folder2-open",
    );
  });

  test("cancel emits onLabelSelectCancel", async () => {
    const wrapper = mount(LabelSelectDialog, {
      global: { plugins: [newPinia()] },
    });
    await flushPromises();

    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.emitted("onLabelSelectCancel")).toEqual([[{}]]);
  });
});
