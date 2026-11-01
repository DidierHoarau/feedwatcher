import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import IndexPage from "~~/pages/index.vue";

vi.mock("axios");

async function mountPage() {
  const wrapper = mount(IndexPage, {
    global: { stubs: { Loading: true, SourcesAttention: true } },
  });
  await flushPromises();
  return wrapper;
}

describe("Home page processors list", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(axios.get).mockReset();
  });

  test("an empty processor list never puts undefined at the head", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [] });

    const wrapper = await mountPage();

    expect((wrapper.vm as any).processorInfos).toEqual([]);
    wrapper.unmount();
  });

  test("moves the last (catch-all) processor to the front", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ title: "RSS" }, { title: "Any URL" }],
    });

    const wrapper = await mountPage();

    expect((wrapper.vm as any).processorInfos).toEqual([
      { title: "Any URL" },
      { title: "RSS" },
    ]);
    wrapper.unmount();
  });

  test("a non-array processor response yields an empty list", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: null });

    const wrapper = await mountPage();

    expect((wrapper.vm as any).processorInfos).toEqual([]);
    wrapper.unmount();
  });
});

describe("Home page summary state (M3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockResolvedValue({ data: [] });
  });

  test("shows a stale banner and keeps the previous summary on error", async () => {
    const wrapper = await mountPage();
    await wrapper.setData({
      summary: {
        summary: "## Old",
        status: "error",
        generatedAt: "2026-10-31T08:00:00.000Z",
      },
    });

    expect(wrapper.find(".summary-stale").exists()).toBe(true);
    expect(wrapper.find(".summary-stale").text()).toContain(
      "could not be generated"
    );
    expect(wrapper.find(".summary-text").exists()).toBe(true);
    wrapper.unmount();
  });

  test("shows the banner without summary text when there is no digest", async () => {
    const wrapper = await mountPage();
    await wrapper.setData({
      summary: { summary: "", status: "error", generatedAt: null },
    });

    expect(wrapper.find(".summary-stale").exists()).toBe(true);
    expect(wrapper.find(".summary-stale").text()).toContain(
      "could not be generated"
    );
    expect(wrapper.find(".summary-text").exists()).toBe(false);
    wrapper.unmount();
  });
});
