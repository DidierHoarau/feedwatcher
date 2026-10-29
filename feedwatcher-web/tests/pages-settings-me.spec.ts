import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SettingsMe from "~~/pages/settings/me.vue";
import { PreferencesService } from "~~/services/PreferencesService";

vi.mock("axios");
vi.mock("~~/components/NotificationsSettings.vue", () => ({
  default: { name: "NotificationsSettings", template: "<div />" },
}));

describe("Settings > Me interface size preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-scale");
  });

  test("changing the select stores and applies the scale", async () => {
    const wrapper = mount(SettingsMe);

    const select = wrapper.find("select");
    await select.setValue("large");

    expect(localStorage.getItem("ui_scale")).toBe("large");
    expect(document.documentElement.getAttribute("data-ui-scale")).toBe(
      "large",
    );
  });

  test("the select reflects the stored preference", () => {
    localStorage.setItem("ui_scale", "compact");

    const wrapper = mount(SettingsMe);

    expect(
      (wrapper.find("select").element as HTMLSelectElement).value,
    ).toBe("compact");
    expect(PreferencesService.getUiScale()).toBe("compact");
  });
});
