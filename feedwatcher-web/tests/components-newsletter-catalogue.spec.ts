import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { h } from "vue";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NewsletterCatalogue from "~~/components/NewsletterCatalogue.vue";
import { SourcesStore } from "~~/stores/SourcesStore";

vi.mock("axios");

(globalThis as any).SourcesStore = SourcesStore;

const NuxtLinkStub = {
  props: ["to"],
  render() {
    return h(
      "a",
      { href: this.to },
      this.$slots && this.$slots.default ? this.$slots.default() : [],
    );
  },
};

function mountCatalogue() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(NewsletterCatalogue, {
    global: {
      plugins: [pinia],
      stubs: { Loading: true, NuxtLink: NuxtLinkStub },
    },
  });
}

function availableFeed(feedId: string, title = `${feedId} title`) {
  return {
    providerFeedId: feedId,
    title,
    senderName: `${title} sender`,
    senderEmail: `${feedId}@example.com`,
    itemCount: 4,
    latestDate: "2026-10-27T06:00:00.000Z",
    feedUrl: `https://newsletter.example/rss/${feedId}.token`,
    state: "available",
  };
}

const MIXED_FEEDS = [
  availableFeed("alpha", "Alpha News"),
  {
    ...availableFeed("beta", "Beta Weekly"),
    state: "added",
    existingSourceId: "source-1",
  },
  {
    ...availableFeed("gamma", "Gamma Digest"),
    state: "ignored",
  },
];

interface MockOptions {
  newsletterEnabled?: boolean;
  feeds?: any[];
  catalogueError?: any;
  settings?: any;
  subscribeResponse?: any;
  statusError?: boolean;
}

function mockApi(options: MockOptions = {}) {
  const state = {
    newsletterEnabled: options.newsletterEnabled !== false,
    feeds: (options.feeds || MIXED_FEEDS).map((feed) => ({ ...feed })),
    catalogueError: options.catalogueError || null,
    subscribeResponse: options.subscribeResponse || {
      added: [],
      existing: [],
      failed: [],
      ignored: [],
    },
  };
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.endsWith("/status")) {
      if (options.statusError) {
        return Promise.reject(new Error("status down"));
      }
      return Promise.resolve({
        data: { newsletterEnabled: state.newsletterEnabled },
      });
    }
    if (url.endsWith("/sources/newsletter")) {
      if (!state.newsletterEnabled) {
        return Promise.resolve({ data: { enabled: false, feeds: [] } });
      }
      if (state.catalogueError) {
        return Promise.reject(state.catalogueError);
      }
      return Promise.resolve({
        data: { enabled: true, feeds: state.feeds },
      });
    }
    if (url.endsWith("/users/settings")) {
      return Promise.resolve({
        data: {
          settings: options.settings || {
            notifications: {
              digest: true,
              newItems: "all",
              newItemsLabels: [],
            },
            summaryPrompt: "prompt",
            newsletter: { ignoredFeedIds: [] },
          },
        },
      });
    }
    if (url.endsWith("/sources/labels")) {
      return Promise.resolve({ data: { sourceLabels: [] } });
    }
    if (url.endsWith("/counts/unread") || url.endsWith("/counts/saved")) {
      return Promise.resolve({ data: { counts: [] } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.mocked(axios.put).mockResolvedValue({ data: {} } as any);
  vi.mocked(axios.post).mockResolvedValue({
    data: state.subscribeResponse,
  } as any);
  return state;
}

describe("NewsletterCatalogue", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.post).mockReset();
  });

  test("shows a configuration hint and does not call the catalogue when disabled", async () => {
    mockApi({ newsletterEnabled: false });
    const wrapper = mountCatalogue();
    await flushPromises();

    expect(wrapper.text()).toContain("NEWSLETTER_URL");
    expect(wrapper.text()).toContain("not configured on this server");
    expect(
      vi.mocked(axios.get).mock.calls.some(([url]) =>
        String(url).endsWith("/sources/newsletter"),
      ),
    ).toBe(false);
  });

  test("shows an unreachable error and retries the catalogue", async () => {
    const state = mockApi({
      catalogueError: {
        response: {
          status: 502,
          data: {
            error: "The newsletter service is unreachable.",
            code: "newsletter_unreachable",
          },
        },
      },
    });
    const wrapper = mountCatalogue();
    await flushPromises();

    expect(wrapper.text()).toContain("The newsletter service is unreachable.");

    state.catalogueError = null;
    const retry = wrapper
      .findAll("button")
      .find((button) => button.text() === "Retry");
    await retry.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Alpha News");
    expect(wrapper.findAll(".catalogue-row")).toHaveLength(3);
  });

  test("renders state badges, counts, dates and the source link for added rows", async () => {
    mockApi();
    const wrapper = mountCatalogue();
    await flushPromises();

    expect(wrapper.text()).toContain("Available");
    expect(wrapper.text()).toContain("Added");
    expect(wrapper.text()).toContain("Ignored");
    expect(wrapper.text()).toContain("4 items");
    expect(wrapper.find(".catalogue-open-source").attributes("href")).toBe(
      "/sources/source-1",
    );
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1);
  });

  test("searches and filters the rows", async () => {
    mockApi();
    const wrapper = mountCatalogue();
    await flushPromises();

    await wrapper.find('input[type="search"]').setValue("beta");
    expect(wrapper.findAll(".catalogue-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("Beta Weekly");

    await wrapper.find('input[type="search"]').setValue("no such feed");
    expect(wrapper.text()).toContain("No newsletter matches");

    await wrapper.find('input[type="search"]').setValue("");
    await wrapper.find("select").setValue("ignored");
    expect(wrapper.findAll(".catalogue-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("Gamma Digest");
  });

  test("adds the selected feeds in one request", async () => {
    mockApi({
      feeds: [availableFeed("alpha"), availableFeed("beta"), availableFeed("gamma")],
      subscribeResponse: {
        added: [
          { feedId: "alpha", sourceId: "s1" },
          { feedId: "beta", sourceId: "s2" },
          { feedId: "gamma", sourceId: "s3" },
        ],
        existing: [],
        failed: [],
        ignored: [],
      },
    });
    const wrapper = mountCatalogue();
    await flushPromises();

    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      await checkbox.setValue(true);
    }
    const addSelected = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Add selected"));
    expect(addSelected.text()).toContain("(3)");
    await addSelected.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    const [url, payload] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toContain("/sources/newsletter/subscribe");
    expect(payload.feedIds.sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(payload.label).toBe("Newsletters");
    expect(wrapper.text()).toContain("Added 3, already present 0");
  });

  test("ignores a feed and preserves the rest of the settings", async () => {
    mockApi({
      settings: {
        notifications: { digest: true, newItems: "all", newItemsLabels: [] },
        summaryPrompt: "prompt",
        newsletter: { ignoredFeedIds: ["existing-id"] },
      },
    });
    const wrapper = mountCatalogue();
    await flushPromises();

    const ignoreButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Ignore");
    await ignoreButton.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledTimes(1);
    const [url, payload] = vi.mocked(axios.put).mock.calls[0];
    expect(url).toContain("/users/settings");
    expect(payload.settings.newsletter.ignoredFeedIds.sort()).toEqual([
      "alpha",
      "existing-id",
    ]);
    expect(payload.settings.notifications.digest).toBe(true);
    expect(payload.settings.summaryPrompt).toBe("prompt");
    expect(wrapper.text()).toContain("Ignored");
  });

  test("unignores a feed", async () => {
    mockApi({
      settings: {
        notifications: { digest: false, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
        newsletter: { ignoredFeedIds: ["gamma"] },
      },
    });
    const wrapper = mountCatalogue();
    await flushPromises();

    const row = wrapper
      .findAll(".catalogue-row")
      .find((candidate) => candidate.text().includes("Gamma Digest"));
    const unignoreButton = row
      .findAll("button")
      .find((button) => button.text() === "Unignore");
    await unignoreButton.trigger("click");
    await flushPromises();

    const [, payload] = vi.mocked(axios.put).mock.calls[0];
    expect(payload.settings.newsletter.ignoredFeedIds).toEqual([]);
    expect(row.text()).toContain("Available");
  });

  test("adds an ignored feed anyway with includeIgnored", async () => {
    mockApi({
      settings: {
        notifications: { digest: false, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
        newsletter: { ignoredFeedIds: ["gamma"] },
      },
      subscribeResponse: {
        added: [{ feedId: "gamma", sourceId: "s3" }],
        existing: [],
        failed: [],
        ignored: [],
      },
    });
    const wrapper = mountCatalogue();
    await flushPromises();

    const row = wrapper
      .findAll(".catalogue-row")
      .find((candidate) => candidate.text().includes("Gamma Digest"));
    const addAnyway = row
      .findAll("button")
      .find((button) => button.text() === "Add anyway");
    await addAnyway.trigger("click");
    await flushPromises();

    const [, payload] = vi.mocked(axios.post).mock.calls[0];
    expect(payload.feedIds).toEqual(["gamma"]);
    expect(payload.includeIgnored).toBe(true);
  });

  test("shows an empty state when the catalogue has no feeds", async () => {
    mockApi({ feeds: [] });
    const wrapper = mountCatalogue();
    await flushPromises();

    expect(wrapper.text()).toContain("does not offer any feeds yet");
  });
});
