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
