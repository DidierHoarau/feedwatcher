import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SettingsMe from "~~/pages/settings/me.vue";
import { PreferencesService } from "~~/services/PreferencesService";

const { isAvailable } = vi.hoisted(() => ({ isAvailable: vi.fn() }));

vi.mock("axios");
vi.mock("~~/services/LoginCodes", () => ({
  LoginCodesServiceCreate: () => ({}),
  LoginCodesIsAvailable: () => isAvailable(),
}));
vi.mock("~~/components/NotificationsSettings.vue", () => ({
  default: { name: "NotificationsSettings", template: "<div />" },
}));
vi.mock(
  "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue",
  () => ({
    default: {
      name: "AuthorizeDeviceCard",
      props: ["service", "variant", "headingLevel"],
      template: '<div data-test="authorize-device-card" />',
    },
  }),
);

describe("Settings > Me interface size preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-scale");
    isAvailable.mockReset();
    isAvailable.mockResolvedValue(false);
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

describe("Settings > Me authorize-device card", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-scale");
    isAvailable.mockReset();
  });

  test("shows the card when the feature is available", async () => {
    isAvailable.mockResolvedValue(true);

    const wrapper = mount(SettingsMe);
    await flushPromises();

    expect(wrapper.find('[data-test="authorize-device-card"]').exists()).toBe(
      true,
    );
    wrapper.unmount();
  });

  test("hides the card when the feature is unavailable", async () => {
    isAvailable.mockResolvedValue(false);

    const wrapper = mount(SettingsMe);
    await flushPromises();

    expect(wrapper.find('[data-test="authorize-device-card"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
