import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import KeyboardShortcutsHelp from "~~/components/KeyboardShortcutsHelp.vue";
import { EventBus, EventTypes } from "~~/services/EventBus";

describe("KeyboardShortcutsHelp", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  test("stays hidden until the SHORTCUTS_HELP event is emitted", async () => {
    const wrapper = mount(KeyboardShortcutsHelp, { attachTo: document.body });

    expect(document.querySelector(".shortcuts-help-panel")).toBeNull();

    EventBus.emit(EventTypes.SHORTCUTS_HELP, {});
    await wrapper.vm.$nextTick();

    const panel = document.querySelector(".shortcuts-help-panel");
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Keyboard shortcuts");
    expect(panel.textContent).toContain("Next / previous item");
    expect(panel.textContent).toContain("Open the item in reader view");
    wrapper.unmount();
  });

  test("closes on Escape or when Close is clicked", async () => {
    const wrapper = mount(KeyboardShortcutsHelp, { attachTo: document.body });
    EventBus.emit(EventTypes.SHORTCUTS_HELP, {});
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".shortcuts-help-panel")).not.toBeNull();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".shortcuts-help-panel")).toBeNull();

    EventBus.emit(EventTypes.SHORTCUTS_HELP, {});
    await wrapper.vm.$nextTick();
    const closeButton = Array.from(
      document.querySelectorAll(".shortcuts-help-panel button"),
    ).find((b) => b.textContent?.includes("Close")) as HTMLButtonElement;
    closeButton.click();
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".shortcuts-help-panel")).toBeNull();
    wrapper.unmount();
  });
});
