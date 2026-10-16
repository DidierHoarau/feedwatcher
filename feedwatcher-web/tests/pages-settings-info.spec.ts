import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SettingsInfo from "~~/pages/settings/info.vue";

describe("Settings Info page", () => {
  test("lists the keyboard shortcuts and the help hint", () => {
    const wrapper = mount(SettingsInfo);
    const text = wrapper.text();

    expect(text).toContain("Keyboard shortcuts");
    expect(text).toContain("Next / previous item");
    expect(text).toContain("Mark read / unread");
    expect(text).toContain("Open the item in reader view");
    expect(text).toContain("Close dialog / popover");
    expect(wrapper.findAll("tbody tr")).toHaveLength(9);
    expect(text).toContain("anywhere to open the shortcuts help");
    wrapper.unmount();
  });
});
