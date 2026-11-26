import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import LoginPage from "~~/pages/login.vue";

const { isAvailable } = vi.hoisted(() => ({ isAvailable: vi.fn() }));

vi.mock("axios");
vi.mock("~~/services/LoginCodes", () => ({
  LoginCodesServiceCreate: () => ({}),
  LoginCodesIsAvailable: () => isAvailable(),
}));
vi.mock("@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue", () => ({
  default: {
    name: "LoginWithCodeCard",
    props: ["service", "variant", "headingLevel"],
    template: '<div data-test="login-with-code-card" />',
  },
}));

async function mountPage() {
  const wrapper = mount(LoginPage);
  await flushPromises();
  return wrapper;
}

describe("Login page login-with-code card", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockResolvedValue({
      data: { initialized: true },
    });
    isAvailable.mockReset();
    (globalThis as any).useRouter = () => ({ push: vi.fn() });
    (globalThis as any).AuthenticationStore = () => ({});
    (globalThis as any).UserProcessorInfoStore = () => ({ check: vi.fn() });
  });

  test("shows the card next to the password form when available", async () => {
    isAvailable.mockResolvedValue(true);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="login-with-code-card"]').exists()).toBe(
      true,
    );
    expect(wrapper.find("article.settings-card").exists()).toBe(true);
    wrapper.unmount();
  });

  test("hides the card when the feature is unavailable", async () => {
    isAvailable.mockResolvedValue(false);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="login-with-code-card"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  test("hides the card on the first-run (new user) form", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { initialized: false },
    });
    isAvailable.mockResolvedValue(true);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="login-with-code-card"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("New User");
    wrapper.unmount();
  });
});
