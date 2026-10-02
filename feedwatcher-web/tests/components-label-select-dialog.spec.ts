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
        labelName: "news",
        displayName: "news",
        isCollapsed: false,
        isVisible: true,
      },
    ] as never[];
    await flushPromises();

    await wrapper.find(".source-name-name").trigger("click");

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
      "news",
    );
    expect(sourcesStore.selectedIndex).toBe(0);
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
