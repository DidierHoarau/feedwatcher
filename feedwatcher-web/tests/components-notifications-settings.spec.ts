import { describe, expect, test, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { NotificationsService } from "~~/services/NotificationsService";
import { EventBus, EventTypes } from "~~/services/EventBus";
import NotificationsSettings from "~~/components/NotificationsSettings.vue";

vi.mock("axios");
vi.mock("~~/services/NotificationsService", () => ({
  NotificationsService: {
    isSupported: vi.fn(() => true),
    getServerStatus: vi.fn(),
    getSubscription: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

const SERVER_SETTINGS_URL = "/api/users/settings";
const LABELS_URL = "/api/sources/labels";

function mountCard() {
  return mount(NotificationsSettings, {
    global: {
      stubs: { teleport: true },
    },
  });
}

const ENABLED_STATUS = {
  notificationsEnabled: true,
  vapidPublicKey: "test-vapid-key",
};

const SERVER_SETTINGS = {
  settings: {
    notifications: {
      digest: true,
      newItems: "labels",
      newItemsLabels: ["tech"],
    },
    summaryPrompt: "Custom prompt",
    newsletter: {
      ignoredFeedIds: ["morningbrew"],
    },
  },
};

describe("NotificationsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NotificationsService.isSupported).mockReturnValue(true);
    vi.mocked(NotificationsService.getServerStatus).mockResolvedValue(
      ENABLED_STATUS
    );
    vi.mocked(NotificationsService.getSubscription).mockResolvedValue(null);
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith(SERVER_SETTINGS_URL)) {
        return Promise.resolve({ data: SERVER_SETTINGS });
      }
      if (url.endsWith(LABELS_URL)) {
        return Promise.resolve({
          data: {
            sourceLabels: [
              { labelName: "tech", sourceName: "A", sourceId: "s1" },
              { labelName: "tech", sourceName: "B", sourceId: "s2" },
              { labelName: "news", sourceName: "C", sourceId: "s3" },
              { labelName: null, sourceName: "D", sourceId: "s4" },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  });

  test("renders the loaded settings with deduplicated labels", async () => {
    const wrapper = mountCard();
    await flushPromises();

    const digestCheck = wrapper.find('input[type="checkbox"]');
    expect((digestCheck.element as HTMLInputElement).checked).toBe(true);

    const select = wrapper.find("select");
    expect((select.element as HTMLSelectElement).value).toBe("labels");

    const text = wrapper.text();
    expect(text).toContain("tech");
    expect(text).toContain("news");
    // "tech" appears once as a watched label even though two sources carry it
    expect(text.split("tech").length - 1).toBe(1);
    expect(
      (wrapper.find("textarea").element as HTMLTextAreaElement).value
    ).toBe("Custom prompt");
  });

  test("Save issues PUT /users/settings with the edited payload", async () => {
    vi.mocked(axios.put).mockResolvedValue({ data: {} });
    const alerts: any[] = [];
    EventBus.on(EventTypes.ALERT_MESSAGE, (msg) => alerts.push(msg));
    const wrapper = mountCard();
    await flushPromises();

    wrapper.find("textarea").setValue("Updated prompt");
    const saveButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Save"));
    await saveButton.trigger("click");
    await flushPromises();

    expect(axios.put).toHaveBeenCalledTimes(1);
    const [url, payload] = vi.mocked(axios.put).mock.calls[0];
    expect(url).toBe(SERVER_SETTINGS_URL);
    expect(payload.settings.summaryPrompt).toBe("Updated prompt");
    expect(payload.settings.notifications.digest).toBe(true);
    expect(payload.settings.notifications.newItems).toBe("labels");
    expect(payload.settings.notifications.newItemsLabels).toEqual(["tech"]);
    expect(payload.settings.newsletter.ignoredFeedIds).toEqual(["morningbrew"]);
    expect(alerts.some((a) => a.type === "info")).toBe(true);
    EventBus.off(EventTypes.ALERT_MESSAGE);
  });

  test("Enable push subscribes with the server VAPID key", async () => {
    vi.mocked(NotificationsService.subscribe).mockResolvedValue(undefined);
    const wrapper = mountCard();
    await flushPromises();

    const enableButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Enable Push"));
    expect(enableButton).toBeDefined();
    await enableButton.trigger("click");
    await flushPromises();

    expect(NotificationsService.subscribe).toHaveBeenCalledWith(
      "test-vapid-key"
    );
    expect(
      wrapper.findAll("button").find((b) => b.text().includes("Disable Push"))
    ).toBeDefined();
  });

  test("surfaces an error when enabling push is denied", async () => {
    vi.mocked(NotificationsService.subscribe).mockRejectedValue(
      new Error("Notification permission denied")
    );
    const alerts: any[] = [];
    EventBus.on(EventTypes.ALERT_MESSAGE, (msg) => alerts.push(msg));
    const wrapper = mountCard();
    await flushPromises();

    const enableButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Enable Push"));
    await enableButton.trigger("click");
    await flushPromises();

    expect(
      alerts.some((a) => a.type === "error" && /permission denied/.test(a.text))
    ).toBe(true);
    EventBus.off(EventTypes.ALERT_MESSAGE);
  });

  test("shows the unsupported hint when the browser cannot do push", async () => {
    vi.mocked(NotificationsService.isSupported).mockReturnValue(false);
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Push notifications are not supported by this browser."
    );
    expect(wrapper.text()).not.toContain("Enable Push");
  });

  test("shows the disabled hint when the server has notifications off", async () => {
    vi.mocked(NotificationsService.getServerStatus).mockResolvedValue({
      notificationsEnabled: false,
      vapidPublicKey: "",
    });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Push notifications are not enabled on this server."
    );
    expect(wrapper.text()).not.toContain("Enable Push");
  });
});
