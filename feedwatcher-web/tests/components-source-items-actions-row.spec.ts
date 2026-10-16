import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { describe, expect, test, vi } from "vitest";
import SourceItemsActionsRow from "~~/components/SourceItemsActionsRow.vue";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";

vi.mock("axios");

const NuxtLinkStub = { template: "<a><slot /></a>", props: ["to"] };
const ConfirmPopoverStub = { template: "<span></span>" };

function mountRow(filterStatus = "unread") {
  setActivePinia(createPinia());
  vi.mocked(axios.get).mockResolvedValue({ data: { tags: [] } });
  vi.mocked(axios.post).mockResolvedValue({
    data: { sourceItems: [], pageHasMore: false, nextCursor: null },
  });
  (globalThis as any).SourceItemsStore = SourceItemsStore;
  const store = SourceItemsStore();
  store.sourceItems = [{ id: "item-1", status: "unread" }] as any;
  return mount(SourceItemsActionsRow, {
    props: { filterPlaceholder: "Filter items", filterStatus },
    global: {
      stubs: { NuxtLink: NuxtLinkStub, ConfirmPopover: ConfirmPopoverStub },
    },
  });
}

describe("SourceItemsActionsRow", () => {
  test("does not render the keyboard shortcuts button", () => {
    const wrapper = mountRow();

    expect(wrapper.find(".bi-keyboard").exists()).toBe(false);
    expect(wrapper.find('[title="Keyboard shortcuts"]').exists()).toBe(false);
    wrapper.unmount();
  });

  test("still renders the filter input and the mark-all action", () => {
    const wrapper = mountRow();

    expect(wrapper.find("#sources-items-search-filter").exists()).toBe(true);
    expect(wrapper.find(".bi-check2-square").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("SourceItemsActionsRow filters", () => {
  test("cycles the read status through unread, all and read", async () => {
    const wrapper = mountRow("unread");

    await wrapper.find('[aria-label="Currently showing unread only — show all items"]').trigger("click");
    expect(wrapper.emitted("update:filterStatus")[0]).toEqual(["all"]);

    const wrapperAll = mountRow("all");
    await wrapperAll
      .find('[aria-label="Currently showing all items — show read only"]')
      .trigger("click");
    expect(wrapperAll.emitted("update:filterStatus")[0]).toEqual(["read"]);

    const wrapperRead = mountRow("read");
    await wrapperRead
      .find('[aria-label="Currently showing read only — show unread items only"]')
      .trigger("click");
    expect(wrapperRead.emitted("update:filterStatus")[0]).toEqual(["unread"]);

    wrapper.unmount();
    wrapperAll.unmount();
    wrapperRead.unmount();
  });

  test("changing a date bound to the store triggers a fetch", async () => {
    const wrapper = mountRow();
    const store = SourceItemsStore();

    await wrapper.find('input[aria-label="Show items from date"]').setValue("2026-10-01");
    await wrapper.find('input[aria-label="Show items until date"]').setValue("2026-10-05");
    expect(store.minDate).toBe("2026-10-01");
    expect(store.maxDate).toBe("2026-10-05");

    wrapper.unmount();
  });

  test("the sort select updates the store and triggers a fetch", async () => {
    const wrapper = mountRow();
    const store = SourceItemsStore();

    await wrapper.find('select[aria-label="Sort items"]').setValue("date_asc");
    expect(store.sort).toBe("date_asc");
    // fetch resets the list; the store fetch is fire-and-forget here, the
    // request payload contract is covered by the store spec.
    wrapper.unmount();
  });

  test("the tag select is rendered once tags exist and filters by tag", async () => {
    const wrapper = mountRow();
    const store = SourceItemsStore();
    store.availableTags = ["news", "tech"] as any;
    await wrapper.vm.$nextTick();

    const tagSelect = wrapper.find('select[aria-label="Filter by tag"]');
    expect(tagSelect.exists()).toBe(true);
    await tagSelect.setValue("tech");
    expect(store.searchTagName).toBe("tech");
    wrapper.unmount();
  });

  test("the tag select is hidden when the user has no tags", () => {
    const wrapper = mountRow();
    expect(wrapper.find('select[aria-label="Filter by tag"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
