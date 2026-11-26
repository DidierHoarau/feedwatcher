import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import type { Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppUpdatePrompt from "../components/AppUpdatePrompt.vue";

const mocks = vi.hoisted(() => {
  const swUpdate = vi.fn(async () => undefined);
  const getRegistration = vi.fn(async () => ({ update: swUpdate }));
  return {
    useAppUpdate: vi.fn(),
    createBuildVersionProbe: vi.fn(),
    swUpdate,
    getRegistration,
  };
});

vi.mock("@devopsplaybook.io/common-web/composables/useAppUpdate", () => ({
  useAppUpdate: mocks.useAppUpdate,
}));
vi.mock("@devopsplaybook.io/common-web/services/BuildVersionProbe", () => ({
  createBuildVersionProbe: mocks.createBuildVersionProbe,
}));

let updateAvailable: Ref<boolean>;
let reload: ReturnType<typeof vi.fn>;
let dismiss: ReturnType<typeof vi.fn>;

function updateOptions(): any {
  return mocks.useAppUpdate.mock.calls[0][0];
}

beforeEach(() => {
  updateAvailable = ref(false);
  reload = vi.fn(async () => undefined);
  dismiss = vi.fn(() => {
    updateAvailable.value = false;
  });
  mocks.createBuildVersionProbe.mockReturnValue(vi.fn(async () => null));
  mocks.useAppUpdate.mockReturnValue({
    updateAvailable,
    dismissed: ref(false),
    latestBuildId: ref(null),
    checkNow: vi.fn(),
    start: vi.fn(() => () => undefined),
    stop: vi.fn(),
    reload,
    dismiss,
  });
  vi.stubGlobal("useRuntimeConfig", () => ({ app: { buildId: "build-a" } }));
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: { getRegistration: mocks.getRegistration },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  delete (window.navigator as any).serviceWorker;
});

describe("AppUpdatePrompt", () => {
  it("wires the shared probe and the current build id without a reload hook", () => {
    mount(AppUpdatePrompt);

    expect(mocks.createBuildVersionProbe).toHaveBeenCalledWith();
    const options = updateOptions();
    expect(options).toEqual(
      expect.objectContaining({
        currentBuildId: "build-a",
        fetchLatestBuildId: expect.any(Function),
      }),
    );
    // FeedWatcher has no offline queue to flush before the reload
    expect(options.beforeReload).toBeUndefined();
  });

  it("stays hidden by default and shows the notice when signalled", async () => {
    const wrapper = mount(AppUpdatePrompt);
    expect(wrapper.find('[data-testid="app-update-reload"]').exists()).toBe(
      false,
    );

    updateAvailable.value = true;
    await nextTick();
    await flushPromises();

    expect(wrapper.find('[data-testid="app-update-reload"]').exists()).toBe(
      true,
    );
    expect(wrapper.get('[data-testid="app-update-message"]').text()).toBe(
      "New version available.",
    );
    // A new build ships a new sw.js: the registration is asked to update
    expect(mocks.getRegistration).toHaveBeenCalled();
    expect(mocks.swUpdate).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("reloads exactly once on Reload", async () => {
    const wrapper = mount(AppUpdatePrompt);
    updateAvailable.value = true;
    await nextTick();

    await wrapper.get('[data-testid="app-update-reload"]').trigger("click");
    await flushPromises();

    expect(reload).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("dismisses the notice on Later", async () => {
    const wrapper = mount(AppUpdatePrompt);
    updateAvailable.value = true;
    await nextTick();

    await wrapper.get('[data-testid="app-update-later"]').trigger("click");
    await flushPromises();

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="app-update-reload"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
