import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourcesAttention from "~~/components/SourcesAttention.vue";
import { SourcesStore } from "~~/stores/SourcesStore";

vi.mock("axios");

// Nuxt auto-imports used by the component.
(globalThis as any).SourcesStore = SourcesStore;
(globalThis as any).UserProcessorInfoStore = () => ({ check: () => {} });

const NuxtLinkStub = {
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

function newPinia() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

function seedSources(sourcesStore: any) {
  sourcesStore.sources = [
    {
      sourceId: "source-failing",
      isLabel: false,
      isRoot: false,
      depth: 1,
      name: "Failing Source",
      displayName: "Failing Source",
      labelName: "",
      sourceInfo: {
        url: "https://example.com/dead",
        health: "failing",
        fetchErrorCount: 6,
        lastFetchError: "Request failed with status code 404",
        lastFetchErrorClass: "permanent",
      },
    },
    {
      sourceId: "source-disabled",
      isLabel: false,
      isRoot: false,
      depth: 1,
      name: "Disabled Source",
      displayName: "Disabled Source",
      labelName: "",
      sourceInfo: {
        url: "https://example.com/gone",
        health: "disabled",
        fetchErrorCount: 11,
        lastFetchError: "Request failed with status code 410",
      },
    },
    {
      sourceId: "source-stale",
      isLabel: false,
      isRoot: false,
      depth: 1,
      name: "Stale Source",
      displayName: "Stale Source",
      labelName: "",
      sourceInfo: {
        url: "https://example.com/quiet",
        health: "stale",
        lastItemDate: "2026-01-01T00:00:00Z",
      },
    },
  ] as never[];
}

async function mountAttention() {
  const pinia = newPinia();
  const sourcesStore = SourcesStore();
  seedSources(sourcesStore);
  const wrapper = mount(SourcesAttention, {
    global: {
      plugins: [pinia],
      stubs: { NuxtLink: NuxtLinkStub, Loading: true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("SourcesAttention", () => {
  beforeEach(() => {
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockResolvedValue({ data: { counts: [] } });
  });

  test("shows the plain-language diagnosis for each source", async () => {
    const wrapper = await mountAttention();

    expect(wrapper.html()).toContain(
      "The source URL no longer works. Update the URL to recover.",
    );
    expect(wrapper.html()).toContain(
      "Fetching keeps failing: Request failed with status code 410",
    );
  });

  test("offers Fetch now on failing sources and Resume fetching on disabled ones", async () => {
    const wrapper = await mountAttention();

    const fetchNow = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("Fetch now"));
    const resume = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("Resume fetching"));
    expect(fetchNow).toHaveLength(1);
    expect(resume).toHaveLength(1);

    vi.mocked(axios.put).mockResolvedValue({});
    await fetchNow[0].trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/sources/source-failing/fetch"),
      {},
      expect.anything(),
    );
  });

  test("links Fix to the source edit page for failing and disabled sources", async () => {
    const wrapper = await mountAttention();

    const fixLinks = wrapper
      .findAll("a")
      .filter((a) => a.text() === "Fix")
      .map((a) => a.attributes("href"));
    expect(fixLinks).toEqual([
      "/sources/source-disabled",
      "/sources/source-failing",
    ]);
  });

  test("does not offer Fix or a fetch button for stale sources", async () => {
    const wrapper = await mountAttention();

    const staleRow = wrapper
      .findAll(".sources-attention-item")
      .filter((item) => item.html().includes("Stale Source"))[0];
    expect(staleRow.find("button").exists()).toBe(false);
    expect(
      staleRow.findAll("a").filter((a) => a.text() === "Fix"),
    ).toHaveLength(0);
  });
});
