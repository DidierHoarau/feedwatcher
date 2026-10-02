import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceIdPage from "~~/pages/sources/[sourceId].vue";
import { SourcesStore } from "~~/stores/SourcesStore";

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
          data: { id: "source-1", name: "My Source", info: {} },
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
