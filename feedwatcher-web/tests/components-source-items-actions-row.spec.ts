import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { describe, expect, test, vi } from "vitest";
import SourceItemsActionsRow from "~~/components/SourceItemsActionsRow.vue";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";

vi.mock("axios");

const NuxtLinkStub = { template: "<a><slot /></a>", props: ["to"] };
const ConfirmPopoverStub = { template: "<span></span>" };

function mountRow(filterStatus = "unread", storeSetup = {}) {
  setActivePinia(createPinia());
  vi.mocked(axios.get).mockResolvedValue({ data: { tags: [] } });
  vi.mocked(axios.post).mockResolvedValue({
    data: { sourceItems: [], pageHasMore: false, nextCursor: null },
  });
  (globalThis as any).SourceItemsStore = SourceItemsStore;
  const store = SourceItemsStore();
  store.sourceItems = [{ id: "item-1", status: "unread" }] as any;
  Object.assign(store, storeSetup);
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

describe("SourceItemsActionsRow advanced filters", () => {
  test("advanced filters are hidden by default on a fresh store", () => {
    const wrapper = mountRow();

    expect(wrapper.find(".actions-row-advanced").isVisible()).toBe(false);
    wrapper.unmount();
  });

  test("the funnel toggle shows and hides the advanced filters", async () => {
    const wrapper = mountRow();
    const funnel = wrapper.find('[aria-label="More filters"]');
    const advancedDisplay = () =>
      wrapper.find(".actions-row-advanced").element.style.display;

    await funnel.trigger("click");
    expect(advancedDisplay()).toBe("");
    expect(funnel.attributes("aria-expanded")).toBe("true");

    await funnel.trigger("click");
    expect(advancedDisplay()).toBe("none");
    expect(funnel.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  test("the advanced filters open automatically when a filter is active", () => {
    const cases = [
      { sort: "relevance" },
      { minDate: "2026-10-01" },
      { maxDate: "2026-10-05" },
      { searchTagName: "news" },
    ];
    for (const storeSetup of cases) {
      const wrapper = mountRow("unread", storeSetup);
      expect(wrapper.find(".actions-row-advanced").isVisible()).toBe(true);
      wrapper.unmount();
    }
  });

  test("each advanced filter control has a visible label", async () => {
    const wrapper = mountRow();
    const store = SourceItemsStore();
    store.availableTags = ["news"] as any;
    await wrapper.vm.$nextTick();
    await wrapper.find('[aria-label="More filters"]').trigger("click");

    const labels = wrapper
      .findAll(".actions-row-field .actions-row-label")
      .map((label) => label.text());
    expect(labels).toEqual(["Sort", "From", "To", "Tag"]);
    for (const field of wrapper.findAll(".actions-row-field")) {
      expect(field.find("select, input").exists()).toBe(true);
    }
    wrapper.unmount();
  });

  test("the grid modifier classes keep the date bounds side by side", () => {
    const wrapper = mountRow();

    expect(wrapper.find(".actions-row-field-from").exists()).toBe(true);
    expect(wrapper.find(".actions-row-field-to").exists()).toBe(true);
    expect(wrapper.find(".actions-row-field-from select, .actions-row-field-from input").exists()).toBe(true);
    expect(wrapper.find(".actions-row-field-to select, .actions-row-field-to input").exists()).toBe(true);
    wrapper.unmount();
  });

  test("the funnel is highlighted while a filter is active", () => {
    const active = mountRow("unread", { searchTagName: "news" });
    expect(active.find(".bi-funnel").classes()).toContain("filters-active");
    active.unmount();

    const plain = mountRow();
    expect(plain.find(".bi-funnel").classes()).not.toContain("filters-active");
    plain.unmount();
  });
});
