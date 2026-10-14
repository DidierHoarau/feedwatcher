import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceIdPage from "~~/pages/sources/[sourceId].vue";
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
