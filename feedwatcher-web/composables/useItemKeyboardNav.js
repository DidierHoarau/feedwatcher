import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const EDITABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

// Keyboard-first navigation over the item lists (sources, bookmarks):
// j/k to move, m/s to act on the active item, o/v/r to read, / and ? for
// the filter and the shortcuts help.
export function useItemKeyboardNav({ getItems }) {
  const activeIndex = ref(-1);

  function currentItems() {
    try {
      return getItems?.() || [];
    } catch {
      return [];
    }
  }

  function currentItem() {
    const items = currentItems();
    if (activeIndex.value < 0 || activeIndex.value >= items.length) {
      return null;
    }
    return items[activeIndex.value];
  }

  function cardElement(item) {
    if (!item?.id) {
      return null;
    }
    return document.querySelector(`[data-kb-card='${item.id}']`);
  }

  function highlight() {
    document
      .querySelectorAll("[data-kb-active]")
      .forEach((el) => el.removeAttribute("data-kb-active"));
    const card = cardElement(currentItem());
    if (card) {
      card.setAttribute("data-kb-active", "");
      card.scrollIntoView({ block: "nearest" });
    }
  }

  function move(delta) {
    const items = currentItems();
    if (items.length === 0) {
      activeIndex.value = -1;
      return;
    }
    let next = activeIndex.value + delta;
    if (next < 0) {
      next = 0;
    }
    if (next > items.length - 1) {
      next = items.length - 1;
    }
    activeIndex.value = next;
    highlight();
  }

  async function toggleRead() {
    const item = currentItem();
    if (!item) {
      return;
    }
    const status = item.status === "read" ? "unread" : "read";
    await axios
      .put(
        `${(await Config.get()).SERVER_URL}/items/status`,
        { status, itemIds: [item.id] },
        await AuthService.getAuthHeader(),
      )
      .then(() => {
        item.status = status;
        EventBus.emit(EventTypes.ITEMS_UPDATED, {});
      })
      .catch(handleError);
  }

  async function toggleSaved() {
    const item = currentItem();
    if (!item) {
      return;
    }
    const saving = item.isSaved !== true;
    const request = saving
      ? axios.put(
          `${(await Config.get()).SERVER_URL}/lists/items`,
          { itemId: item.id },
          await AuthService.getAuthHeader(),
        )
      : axios.delete(
          `${(await Config.get()).SERVER_URL}/lists/items/${item.id}`,
          await AuthService.getAuthHeader(),
        );
    await request
      .then(() => {
        item.isSaved = saving;
      })
      .catch(handleError);
  }

  function openItemDialog(openReader) {
    const item = currentItem();
    if (!item) {
      return;
    }
    EventBus.emit(
      EventTypes.OPEN_ITEM,
      openReader ? { item, openReader: true } : { item, showFullSource: false },
    );
  }

  function openExternal() {
    const item = currentItem();
    if (!item?.url?.startsWith("http")) {
      return;
    }
    window.open(item.url, "_blank");
  }

  function focusFilter() {
    document.getElementById("sources-items-search-filter")?.focus();
  }

  function isBlockedContext(target) {
    if (
      target instanceof HTMLElement &&
      (EDITABLE_TAGS.includes(target.tagName) || target.isContentEditable)
    ) {
      return true;
    }
    // SourceDialog and ConfirmPopover handle their own keys (Esc, etc.)
    if (document.querySelector("dialog[open]")) {
      return true;
    }
    if (document.querySelector(".confirm-popover")) {
      return true;
    }
    return false;
  }

  function onKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (isBlockedContext(event.target)) {
      return;
    }
    switch (event.key) {
      case "j":
        event.preventDefault();
        move(1);
        break;
      case "k":
        event.preventDefault();
        move(-1);
        break;
      case "m":
        event.preventDefault();
        toggleRead();
        break;
      case "s":
        event.preventDefault();
        toggleSaved();
        break;
      case "o":
        event.preventDefault();
        openItemDialog(false);
        break;
      case "r":
        event.preventDefault();
        openItemDialog(true);
        break;
      case "v":
        event.preventDefault();
        openExternal();
        break;
      case "/":
        event.preventDefault();
        focusFilter();
        break;
      case "?":
        event.preventDefault();
        EventBus.emit(EventTypes.SHORTCUTS_HELP, {});
        break;
    }
  }

  onMounted(() => {
    document.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("keydown", onKeydown);
    document
      .querySelectorAll("[data-kb-active]")
      .forEach((el) => el.removeAttribute("data-kb-active"));
  });

  return { activeIndex };
}
