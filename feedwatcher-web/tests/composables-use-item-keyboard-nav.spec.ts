import { mount } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useItemKeyboardNav } from "~~/composables/useItemKeyboardNav";
import { EventBus, EventTypes } from "~~/services/EventBus";
import { createPinia, setActivePinia } from "pinia";

vi.mock("axios");

function newItem(overrides = {}) {
  return {
    id: "item-1",
    title: "An item",
    status: "unread",
    url: "https://example.com/a",
    isSaved: false,
    ...overrides,
  };
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

function stubCard(id: string) {
  const card = document.createElement("div");
  card.setAttribute("data-kb-card", id);
  document.body.appendChild(card);
  return card;
}

describe("useItemKeyboardNav", () => {
  let onOpenItem: any;
  let onShortcutsHelp: any;
  let scrollIntoView: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    onOpenItem = vi.fn();
    onShortcutsHelp = vi.fn();
    EventBus.on(EventTypes.OPEN_ITEM, onOpenItem);
    EventBus.on(EventTypes.SHORTCUTS_HELP, onShortcutsHelp);
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(axios.put).mockResolvedValue({});
    vi.mocked(axios.delete).mockResolvedValue({});
  });

  afterEach(() => {
    EventBus.off(EventTypes.OPEN_ITEM);
    EventBus.off(EventTypes.SHORTCUTS_HELP);
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  // Mounts a host component so the composable registers its document
  // listener through onMounted like in the app, and cleans it up on unmount.
  function mountComposable(items: any[]) {
    const wrapper = mount({
      setup() {
        const { activeIndex } = useItemKeyboardNav({
          getItems: () => items,
        });
        return { activeIndex };
      },
      template: "<div/>",
    });
    return wrapper;
  }

  test("j and k move the active card and highlight it", () => {
    const wrapper = mountComposable([
      newItem({ id: "item-1" }),
      newItem({ id: "item-2" }),
    ]);
    const card1 = stubCard("item-1");
    const card2 = stubCard("item-2");

    pressKey("j");
    expect(card1.getAttribute("data-kb-active")).toBe("");
    pressKey("j");
    expect(card2.getAttribute("data-kb-active")).toBe("");
    expect(card1.hasAttribute("data-kb-active")).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    pressKey("k");
    expect(card1.getAttribute("data-kb-active")).toBe("");
    expect(card2.hasAttribute("data-kb-active")).toBe(false);
    expect(wrapper.vm.activeIndex).toBe(0);
    wrapper.unmount();
  });

  test("keeps j/k within the bounds of the list", () => {
    const wrapper = mountComposable([newItem({ id: "item-1" })]);
    stubCard("item-1");

    pressKey("k");
    pressKey("k");
    expect(wrapper.vm.activeIndex).toBe(0);

    pressKey("j");
    pressKey("j");
    expect(wrapper.vm.activeIndex).toBe(0);
    wrapper.unmount();
  });

  test("m toggles the read status via the API without refetching", async () => {
    const item = newItem({ status: "unread" });
    const wrapper = mountComposable([item]);
    stubCard("item-1");

    pressKey("j");
    pressKey("m");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      "/api/items/status",
      { status: "read", itemIds: ["item-1"] },
      expect.anything(),
    );
    expect(item.status).toBe("read");

    pressKey("m");
    await flushPromises();
    expect(item.status).toBe("unread");
    wrapper.unmount();
  });

  test("s saves and unsaves the active item", async () => {
    const item = newItem({ isSaved: false });
    const wrapper = mountComposable([item]);
    stubCard("item-1");

    pressKey("j");
    pressKey("s");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      "/api/lists/items",
      { itemId: "item-1" },
      expect.anything(),
    );
    expect(item.isSaved).toBe(true);

    pressKey("s");
    await flushPromises();
    expect(vi.mocked(axios.delete)).toHaveBeenCalledWith(
      "/api/lists/items/item-1",
      expect.anything(),
    );
    expect(item.isSaved).toBe(false);
    wrapper.unmount();
  });

  test("o opens the dialog, r opens it in reader mode, v opens externally", () => {
    const item = newItem();
    const wrapper = mountComposable([item]);
    stubCard("item-1");

    pressKey("j");
    pressKey("o");
    expect(onOpenItem).toHaveBeenCalledWith({
      item,
      showFullSource: false,
    });

    pressKey("r");
    expect(onOpenItem).toHaveBeenCalledWith({ item, openReader: true });

    pressKey("v");
    expect(window.open).toHaveBeenCalledWith("https://example.com/a", "_blank");
    wrapper.unmount();
  });

  test("/ focuses the filter input and ? opens the shortcuts help", () => {
    const wrapper = mountComposable([newItem()]);
    const input = document.createElement("input");
    input.id = "sources-items-search-filter";
    const focusSpy = vi.spyOn(input, "focus");
    document.body.appendChild(input);

    pressKey("/");
    expect(focusSpy).toHaveBeenCalled();

    pressKey("?");
    expect(onShortcutsHelp).toHaveBeenCalled();
    wrapper.unmount();
  });

  test("ignores keys typed in editable targets or while a dialog is open", async () => {
    const item = newItem({ status: "unread" });
    const wrapper = mountComposable([item]);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", bubbles: true }),
    );
    await Promise.resolve();
    expect(item.isSaved).toBe(false);

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.appendChild(dialog);
    pressKey("s");
    await Promise.resolve();
    dialog.remove();

    expect(vi.mocked(axios.put)).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
