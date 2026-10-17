import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PodcastPage from "~~/pages/podcast.vue";
import { PodcastPlayerStore } from "~~/stores/PodcastPlayerStore";

vi.mock("axios");

// jsdom has no playable Audio element: stub it with an inert fake.
class FakeAudio {
  src = "";
  preload = "";
  playbackRate = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  addEventListener() {}
  removeEventListener() {}
}
(globalThis as any).Audio = FakeAudio;

// Nuxt auto-imports used by the page.
(globalThis as any).PodcastPlayerStore = PodcastPlayerStore;
const routeQuery: any = { itemId: "item-1" };
const routerReplace = vi.fn();
(globalThis as any).useRoute = () => ({ query: routeQuery });
(globalThis as any).useRouter = () => ({
  push: () => {},
  replace: routerReplace,
  back: () => {},
});

function podcastItem(overrides = {}) {
  return {
    id: "item-1",
    title: "Episode 1",
    datePublished: new Date().toISOString(),
    sourceId: "src-1",
    sourceName: "My Podcast",
    status: "unread",
    content: "",
    info: { isPodcast: true, audioUrl: "https://example.com/ep1.mp3" },
    ...overrides,
  };
}

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(PodcastPage, { global: { plugins: [pinia] } });
  await flushPromises();
  return wrapper;
}

describe("Podcast page playback essentials", () => {
  beforeEach(() => {
    localStorage.clear();
    routeQuery.itemId = "item-1";
    routerReplace.mockClear();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/playback")) {
        return Promise.resolve({
          data: { positionSeconds: 0, durationSeconds: 0, dateUpdated: "" },
        });
      }
      if (url.endsWith("/items/item-1")) {
        return Promise.resolve({ data: podcastItem() });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.put).mockResolvedValue({});
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.post).mockResolvedValue({ data: { sourceItems: [] } });
  });

  test("renders a speed button that cycles the playback rate", async () => {
    const wrapper = await mountPage();
    const store = PodcastPlayerStore();

    const speedButton = wrapper.find(".podcast-speed-btn");
    expect(speedButton.text()).toBe("1x");

    await speedButton.trigger("click");
    expect(store.playbackRate).toBe(1.25);
    expect(wrapper.find(".podcast-speed-btn").text()).toBe("1.25x");
    wrapper.unmount();
  });

  test("mark as played sends the read status and updates the button", async () => {
    const wrapper = await mountPage();
    const item = (wrapper.vm as any).item;

    const markPlayed = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Mark as played"));
    await markPlayed.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/items/status"),
      { status: "read", itemIds: ["item-1"] },
      expect.anything(),
    );
    expect(item.status).toBe("read");
    expect(
      wrapper
        .findAll("button")
        .find((b) => b.text().includes("Played") && !b.text().includes("Mark")),
    ).toBeTruthy();
    wrapper.unmount();
  });

  test("renders up next episodes from the same source and plays one on click", async () => {
    vi.mocked(axios.post).mockImplementation((url: string) => {
      if (url.endsWith("/items/search")) {
        return Promise.resolve({
          data: {
            sourceItems: [
              podcastItem({
                id: "item-2",
                title: "Episode 2",
                datePublished: "2026-10-16T00:00:00.000Z",
              }),
              podcastItem({
                id: "item-3",
                title: "Episode 3",
                datePublished: "2026-10-15T00:00:00.000Z",
                status: "read",
              }),
              podcastItem({
                id: "item-4",
                title: "Episode 4",
                datePublished: "2026-10-14T00:00:00.000Z",
                playbackPositionSeconds: 600,
                playbackDurationSeconds: 3600,
              }),
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    const wrapper = await mountPage();
    const store = PodcastPlayerStore();

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      expect.stringContaining("/items/search"),
      {
        searchCriteria: "sourceId",
        sourceId: "src-1",
        filterStatus: "all",
        sort: "date_desc",
      },
      expect.anything(),
    );
    const rows = wrapper.findAll(".podcast-up-next-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].text()).toContain("Episode 2");
    expect(rows[1].html()).toContain("bi-check2-circle");
    expect(rows[2].find(".podcast-up-next-progress").exists()).toBe(true);

    await rows[0].trigger("click");
    await flushPromises();

    expect(store.currentItem?.id).toBe("item-2");
    expect(routerReplace).toHaveBeenCalledWith({ query: { itemId: "item-2" } });
    expect((wrapper.vm as any).item.title).toBe("Episode 2");
    wrapper.unmount();
  });

  test("shows the resume hint when autoplay is blocked and a position is saved", async () => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/items/item-1/playback")) {
        return Promise.resolve({
          data: { positionSeconds: 0, durationSeconds: 0, dateUpdated: "" },
        });
      }
      if (url.endsWith("/items/item-1")) {
        return Promise.resolve({
          data: podcastItem({
            playbackPositionSeconds: 615,
            playbackDurationSeconds: 3600,
          }),
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    // Blocked autoplay: the page loaded but playback never started
    (globalThis as any).Audio = class extends FakeAudio {
      play = vi.fn(() => Promise.reject(new Error("autoplay blocked")));
    };

    const wrapper = await mountPage();

    const hint = wrapper.find(".podcast-resume-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("Resumes from 10:15");
    wrapper.unmount();
  });

  test("no resume hint for a fresh episode", async () => {
    const wrapper = await mountPage();
    expect(wrapper.find(".podcast-resume-hint").exists()).toBe(false);
    wrapper.unmount();
  });
});
