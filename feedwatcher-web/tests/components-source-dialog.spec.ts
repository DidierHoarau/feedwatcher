import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import SourceDialog from "~~/components/SourceDialog.vue";

vi.mock("axios");

// jsdom implements <dialog> but not showModal/close.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = vi.fn();
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = vi.fn();
  }
});

const mountedWrappers: any[] = [];

const READER_HTML =
  "<p>Reader paragraph</p><script>window.alert(1)</script><img src=\"https://example.com/pic.jpg\">";

function newItem(overrides = {}) {
  return {
    id: "item-1",
    title: "An item",
    sourceName: "A source",
    status: "unread",
    content: "<p>summary content</p>",
    url: "https://example.com/article",
    info: {},
    ...overrides,
  };
}

async function mountDialog(propsData: any) {
  const wrapper = mount(SourceDialog, {
    props: propsData,
    attachTo: document.body,
    global: {
      stubs: { Loading: true },
    },
  });
  mountedWrappers.push(wrapper);
  await wrapper.setProps({ ...propsData, modelValue: true });
  await flushPromises();
  return wrapper;
}

describe("SourceDialog reader view", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.put).mockResolvedValue({});
  });

  afterEach(() => {
    while (mountedWrappers.length) {
      mountedWrappers.pop().unmount();
    }
    document.body.replaceChildren();
  });

  test("offers Reader view for http items and loads the extracted article", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { title: "Extracted Title", content: READER_HTML },
    });
    const wrapper = await mountDialog({ item: newItem() });

    const readerButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Reader view"));
    expect(readerButton).toBeDefined();

    await readerButton.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      "/api/items/fetch-url",
      { url: "https://example.com/article" },
      expect.anything(),
    );
    expect(wrapper.html()).toContain("Reader paragraph");
    expect(wrapper.html()).toContain("https://example.com/pic.jpg");
    expect(wrapper.html()).not.toContain("<script>");
  });

  test("returns to the summary with Show Summary and offers Reader again", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { title: "T", content: READER_HTML },
    });
    const wrapper = await mountDialog({ item: newItem() });

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Reader view"))
      .trigger("click");
    await flushPromises();
    expect(wrapper.html()).toContain("Reader paragraph");

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Show Summary"))
      .trigger("click");
    expect(wrapper.html()).toContain("summary content");
    expect(
      wrapper.findAll("button").find((b) => b.text().includes("Reader view")),
    ).toBeDefined();
  });

  test("shows the error state when extraction fails with 422 and no alert", async () => {
    vi.mocked(axios.post).mockRejectedValue({
      response: { status: 422, data: { error: "Unable to extract" } },
    });
    const wrapper = await mountDialog({ item: newItem() });

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Reader view"))
      .trigger("click");
    await flushPromises();

    expect(wrapper.html()).toContain(
      "Reader view unavailable for this article",
    );
  });

  test("opens the reader directly with initialReader", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { title: "T", content: READER_HTML },
    });
    const wrapper = await mountDialog({
      item: newItem(),
      initialReader: true,
    });
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalled();
    expect(wrapper.html()).toContain("Reader paragraph");
    wrapper.unmount();
  });

  test("the r shortcut toggles the reader view", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { title: "T", content: READER_HTML },
    });
    const wrapper = await mountDialog({ item: newItem() });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", bubbles: true }),
    );
    await flushPromises();
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    expect(wrapper.html()).toContain("Reader paragraph");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", bubbles: true }),
    );
    await flushPromises();
    expect(wrapper.html()).toContain("summary content");
    expect(
      wrapper.findAll("button").find((b) => b.text().includes("Reader view")),
    ).toBeDefined();
    wrapper.unmount();
  });

  test("hides the Reader view button for items without an http url", async () => {
    const wrapper = await mountDialog({
      item: newItem({ url: "" }),
    });
    expect(
      wrapper.findAll("button").find((b) => b.text().includes("Reader view")),
    ).toBeUndefined();
    wrapper.unmount();
  });

  test("keeps the action buttons inside the dialog footer container", async () => {
    const wrapper = await mountDialog({ item: newItem() });

    const footer = wrapper.find("footer.source-dialog-footer");
    expect(footer.exists()).toBe(true);

    const labels = footer.findAll("button").map((b) => b.text());
    expect(labels).toEqual([
      expect.stringContaining("Close"),
      expect.stringContaining("Open"),
      expect.stringContaining("Reader view"),
      expect.stringContaining("Load Full"),
    ]);
  });

  test("keeps the podcast action buttons inside the dialog footer container", async () => {
    const wrapper = await mountDialog({
      item: newItem({
        info: { isPodcast: true, audioUrl: "https://example.com/audio.mp3" },
      }),
    });

    const footer = wrapper.find("footer.source-dialog-footer");
    expect(footer.exists()).toBe(true);

    const labels = footer.findAll("button").map((b) => b.text());
    expect(labels).toEqual([
      expect.stringContaining("Close"),
      expect.stringContaining("Play Episode"),
      expect.stringContaining("Open"),
      expect.stringContaining("Reader view"),
      expect.stringContaining("Load Full"),
    ]);
  });

  test("keeps the dialog article a three-region grid (header, body, footer)", async () => {
    const wrapper = await mountDialog({ item: newItem() });

    const article = wrapper.find("dialog.source-dialog article");
    expect(article.exists()).toBe(true);

    const regions = Array.from(article.element.children).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: el.className,
    }));
    expect(regions).toEqual([
      { tag: "header", className: "" },
      { tag: "div", className: "source-dialog-body" },
      { tag: "footer", className: "source-dialog-footer" },
    ]);
  });
});
