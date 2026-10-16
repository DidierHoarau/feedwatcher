import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceItem from "~~/components/SourceItem.vue";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

// Nuxt auto-imports used by the component.
(globalThis as any).PodcastPlayerStore = () => ({
  currentItem: null,
  isPlaying: false,
});

// jsdom has no IntersectionObserver; the component uses one for auto mark-read.
class IntersectionObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}
(globalThis as any).IntersectionObserver = IntersectionObserverStub;

function newItem(overrides = {}) {
  return {
    id: "item-1",
    title: "A title",
    datePublished: new Date().toISOString(),
    sourceName: "A source",
    content: "<p>content</p>",
    status: "unread",
    info: {},
    isSaved: false,
    ...overrides,
  };
}

describe("SourceItem bookmark state", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.delete).mockReset();
    vi.mocked(axios.put).mockResolvedValue({});
    vi.mocked(axios.delete).mockResolvedValue({});
  });

  test("does not fetch the bookmark state per card on mount", async () => {
    const wrapper = mount(SourceItem, { props: { item: newItem() } });
    await flushPromises();

    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test("reflects the bookmark state provided by the batched list result", async () => {
    const saved = mount(SourceItem, { props: { item: newItem({ isSaved: true }) } });
    expect(saved.html()).toContain("bi-bookmark-check-fill");
    saved.unmount();

    const unsaved = mount(SourceItem, { props: { item: newItem({ isSaved: false }) } });
    expect(unsaved.html()).toContain("bi-bookmark-plus");
    unsaved.unmount();
  });

  test("saving and unsaving updates the shared item state", async () => {
    const item = newItem({ isSaved: false });
    const wrapper = mount(SourceItem, { props: { item } });

    const saveButton = wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Save bookmark");
    await saveButton.trigger("click");
    await flushPromises();
    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/lists/items"),
      { itemId: "item-1" },
      expect.anything(),
    );
    expect(item.isSaved).toBe(true);
    expect(wrapper.html()).toContain("bi-bookmark-check-fill");

    const unsaveButton = wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Remove bookmark");
    await unsaveButton.trigger("click");
    await flushPromises();
    expect(vi.mocked(axios.delete)).toHaveBeenCalledWith(
      expect.stringContaining("/lists/items/item-1"),
      expect.anything(),
    );
    expect(item.isSaved).toBe(false);
    expect(wrapper.html()).toContain("bi-bookmark-plus");
  });
});

describe("SourceItem tags", () => {
  test("renders the item tags as chips on the card", () => {
    const wrapper = mount(SourceItem, {
      props: { item: newItem({ tags: ["news", "deepwork"] }) },
    });
    const chips = wrapper.findAll(".sourceitem-tag");
    expect(chips.map((chip) => chip.text())).toEqual(["news", "deepwork"]);
    wrapper.unmount();
  });

  test("renders no tag chips when the item has none", () => {
    const wrapper = mount(SourceItem, {
      props: { item: newItem({ tags: [] }) },
    });
    expect(wrapper.find(".sourceitem-tags").exists()).toBe(false);
    wrapper.unmount();
  });

  test("the tags button opens the tags dialog for the item", async () => {
    const item = newItem({ tags: ["news"] });
    const wrapper = mount(SourceItem, { props: { item } });
    const opened = vi.fn();
    EventBus.on(EventTypes.OPEN_ITEM_TAGS, opened);

    const tagsButton = wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Edit tags");
    await tagsButton.trigger("click");

    expect(opened).toHaveBeenCalledWith({ item });
    EventBus.off(EventTypes.OPEN_ITEM_TAGS, opened);
    wrapper.unmount();
  });
});
