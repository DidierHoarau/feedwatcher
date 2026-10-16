import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ItemTagsDialog from "~~/components/ItemTagsDialog.vue";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

function newItem(overrides = {}) {
  return {
    id: "item-1",
    title: "A title",
    tags: ["news"],
    ...overrides,
  };
}

async function openDialog(item = newItem()) {
  const wrapper = mount(ItemTagsDialog, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  });
  EventBus.emit(EventTypes.OPEN_ITEM_TAGS, { item });
  await flushPromises();
  return { wrapper, item };
}

describe("ItemTagsDialog", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.get).mockResolvedValue({ data: { tags: ["news", "tech"] } });
    vi.mocked(axios.put).mockResolvedValue({ data: { tags: ["news"] } });
  });

  test("opens from the OPEN_ITEM_TAGS event and renders the item tags as chips", async () => {
    const { wrapper } = await openDialog(newItem({ tags: ["news", "tech"] }));

    expect(wrapper.find(".item-tags-panel").exists()).toBe(true);
    const chips = wrapper.findAll(".item-tag-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].text()).toContain("news");

    wrapper.unmount();
  });

  test("removes a chip locally and saves the remaining tags with PUT", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({ data: { tags: ["tech"] } });
    const { wrapper, item } = await openDialog(newItem({ tags: ["news", "tech"] }));

    await wrapper.find('[aria-label="Remove tag news"]').trigger("click");
    await wrapper.find(".item-tags-footer button:not(.secondary)").trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      "/api/items/item-1/tags",
      { tags: ["tech"] },
      expect.anything(),
    );
    expect(item.tags).toEqual(["tech"]);
    expect(wrapper.find(".item-tags-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  test("adds a tag from the input and includes it in the save payload", async () => {
    const { wrapper } = await openDialog(newItem({ tags: [] }));

    await wrapper.find('input[aria-label="Add a tag"]').setValue("  deepwork  ");
    await wrapper.find(".item-tags-add").trigger("submit");
    expect(wrapper.findAll(".item-tag-chip")).toHaveLength(1);

    await wrapper.find(".item-tags-footer button:not(.secondary)").trigger("click");
    await flushPromises();
    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      "/api/items/item-1/tags",
      { tags: ["deepwork"] },
      expect.anything(),
    );
    wrapper.unmount();
  });

  test("save keeps a pending input value and dedupes tags", async () => {
    const { wrapper } = await openDialog(newItem({ tags: ["news"] }));

    await wrapper.find('input[aria-label="Add a tag"]').setValue("news");
    await wrapper.find(".item-tags-footer button:not(.secondary)").trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      "/api/items/item-1/tags",
      { tags: ["news"] },
      expect.anything(),
    );
    wrapper.unmount();
  });

  test("the datalist is populated with the user's existing tags", async () => {
    const { wrapper } = await openDialog();

    const options = wrapper.findAll("#item-tags-options option");
    expect(options.map((o) => o.attributes("value"))).toEqual(["news", "tech"]);
    wrapper.unmount();
  });

  test("cancel closes without saving", async () => {
    const { wrapper } = await openDialog();

    await wrapper.find(".item-tags-footer button.secondary").trigger("click");
    expect(vi.mocked(axios.put)).not.toHaveBeenCalled();
    expect(wrapper.find(".item-tags-panel").exists()).toBe(false);
    wrapper.unmount();
  });
});
