import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, test } from "vitest";
import SourceItemsActionsRow from "~~/components/SourceItemsActionsRow.vue";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";

const NuxtLinkStub = { template: "<a><slot /></a>", props: ["to"] };
const ConfirmPopoverStub = { template: "<span></span>" };

function mountRow() {
  setActivePinia(createPinia());
  (globalThis as any).SourceItemsStore = SourceItemsStore;
  const store = SourceItemsStore();
  store.sourceItems = [{ id: "item-1", status: "unread" }] as any;
  return mount(SourceItemsActionsRow, {
    props: { filterPlaceholder: "Filter items", filterStatus: "unread" },
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
