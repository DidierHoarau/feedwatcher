import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  PodcastPlayerStore,
  PODCAST_SPEEDS,
  formatTime,
} from "~~/stores/PodcastPlayerStore";
import { PreferencesService } from "~~/services/PreferencesService";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

// jsdom has no playable Audio element: stub it with a controllable fake
// exposing the surface the store uses.
class AudioStub {
  src = "";
  preload = "";
  playbackRate = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  error: any = null;
  listeners: Record<string, Array<() => void>> = {};
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  addEventListener(name: string, cb: () => void) {
    (this.listeners[name] = this.listeners[name] || []).push(cb);
  }
  emit(name: string) {
    for (const cb of this.listeners[name] || []) {
      cb();
    }
  }
}

const audioInstances: AudioStub[] = [];

class FakeAudio extends AudioStub {
  constructor(url?: string) {
    super();
    if (url) {
      this.src = url;
    }
    audioInstances.push(this);
  }
}

function latestAudio(): AudioStub {
  return audioInstances[audioInstances.length - 1];
}

beforeEach(() => {
  audioInstances.length = 0;

  (globalThis as any).Audio = FakeAudio;
  localStorage.clear();
  setActivePinia(createPinia());
  vi.mocked(axios.get).mockReset();
  vi.mocked(axios.get).mockResolvedValue({
    data: { positionSeconds: 0, durationSeconds: 0, dateUpdated: "" },
  });
  vi.mocked(axios.put).mockReset();
  vi.mocked(axios.put).mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

function podcastItem(overrides = {}) {
  return {
    id: "item-1",
    title: "Episode 1",
    status: "unread",
    info: { isPodcast: true, audioUrl: "https://example.com/ep1.mp3" },
    ...overrides,
  };
}

function newStore() {
  return PodcastPlayerStore();
}

describe("PodcastPlayerStore playback speed", () => {
  test("play applies the persisted playback rate to the audio element", () => {
    PreferencesService.setPodcastPlaybackRate(1.5);
    const store = newStore();

    store.play(podcastItem());

    expect(store.playbackRate).toBe(1.5);
    expect(latestAudio().playbackRate).toBe(1.5);
  });

  test("play defaults to 1x without a stored preference", () => {
    const store = newStore();

    store.play(podcastItem());

    expect(store.playbackRate).toBe(1);
    expect(latestAudio().playbackRate).toBe(1);
  });

  test("cyclePlaybackRate walks the speeds and persists the preference", () => {
    const store = newStore();
    store.play(podcastItem());

    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(1.25);
    expect(latestAudio().playbackRate).toBe(1.25);
    expect(
      Number(localStorage.getItem("podcast_playback_rate")),
    ).toBe(1.25);

    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(1.5);
  });

  test("cyclePlaybackRate wraps around to the slowest speed", () => {
    const store = newStore();
    store.play(podcastItem());

    store.setPlaybackRate(PODCAST_SPEEDS[PODCAST_SPEEDS.length - 1]);
    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(PODCAST_SPEEDS[0]);
  });

  test("setPlaybackRate snaps an unknown value to the nearest speed", () => {
    const store = newStore();

    store.setPlaybackRate(1.4);

    expect(store.playbackRate).toBe(1.5);
  });

  test("setPlaybackRate applies to the audio element even while paused", () => {
    PreferencesService.setPodcastPlaybackRate(2);
    const store = newStore();
    store.play(podcastItem());
    store.pause();

    store.setPlaybackRate(0.5);

    expect(latestAudio().playbackRate).toBe(0.5);
  });
});

describe("PodcastPlayerStore resume", () => {
  test("resumes from the saved position", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { positionSeconds: 615, durationSeconds: 3600 },
    });
    const store = newStore();

    store.play(podcastItem());
    latestAudio().duration = 3600;
    latestAudio().emit("loadedmetadata");
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/items/item-1/playback"),
      expect.anything(),
    );
    expect(latestAudio().currentTime).toBe(615);
    expect(store.currentTime).toBe(615);
  });

  test("seeds the scrubber duration from the saved value before metadata loads", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { positionSeconds: 615, durationSeconds: 3600 },
    });
    const store = newStore();

    store.play(podcastItem());
    await flushPromises();

    expect(store.duration).toBe(3600);
  });

  test("a near-end saved position restarts from zero", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { positionSeconds: 3598, durationSeconds: 3600 },
    });
    const store = newStore();

    store.play(podcastItem());
    latestAudio().duration = 3600;
    latestAudio().emit("loadedmetadata");
    await flushPromises();

    expect(latestAudio().currentTime).toBe(0);
    expect(store.currentTime).toBe(0);
  });

  test("a very short saved position is ignored", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { positionSeconds: 2, durationSeconds: 3600 },
    });
    const store = newStore();

    store.play(podcastItem());
    await flushPromises();

    expect(store.currentTime).toBe(0);
  });

  test("a failed playback lookup does not break playback", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("network down"));
    const store = newStore();

    store.play(podcastItem());
    await flushPromises();

    expect(latestAudio().play).toHaveBeenCalled();
  });
});

describe("PodcastPlayerStore persistence", () => {
  test("stop saves the current position (resume survives Stop)", async () => {
    const store = newStore();
    store.play(podcastItem());
    await flushPromises();
    latestAudio().currentTime = 120;
    latestAudio().duration = 3600;

    store.stop();
    await flushPromises();

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining("/items/item-1/playback"),
      { positionSeconds: 120, durationSeconds: 3600 },
      expect.anything(),
    );
  });

  test("pause saves the current position", async () => {
    const store = newStore();
    store.play(podcastItem());
    await flushPromises();
    latestAudio().currentTime = 45;
    latestAudio().duration = 3600;

    store.pause();
    await flushPromises();

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining("/items/item-1/playback"),
      { positionSeconds: 45, durationSeconds: 3600 },
      expect.anything(),
    );
  });

  test("periodic saves are throttled to one per 15 seconds", async () => {
    vi.useFakeTimers();
    const store = newStore();
    store.play(podcastItem());
    latestAudio().duration = 3600;
    await flushPromises();
    vi.mocked(axios.put).mockClear();

    store.seek(10);
    store.seek(20);
    store.seek(30);
    await flushPromises();
    expect(vi.mocked(axios.put)).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15000);
    store.seek(40);
    await flushPromises();
    expect(vi.mocked(axios.put)).toHaveBeenCalledTimes(2);
  });
});

describe("PodcastPlayerStore completion", () => {
  test("ended marks the episode played, resets the position and notifies", async () => {
    const emitSpy = vi.spyOn(EventBus, "emit");
    const item = podcastItem();
    const store = newStore();
    store.play(item);
    await flushPromises();
    latestAudio().duration = 3600;
    vi.mocked(axios.put).mockClear();

    latestAudio().emit("ended");
    await flushPromises();

    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/items/item-1/playback"),
      { positionSeconds: 0, durationSeconds: 3600 },
      expect.anything(),
    );
    expect(vi.mocked(axios.put)).toHaveBeenCalledWith(
      expect.stringContaining("/items/status"),
      { status: "read", itemIds: ["item-1"] },
      expect.anything(),
    );
    expect(item.status).toBe("read");
    expect(emitSpy).toHaveBeenCalledWith(EventTypes.ITEMS_UPDATED, {});
    emitSpy.mockRestore();
  });
});

describe("PodcastPlayerStore basics", () => {
  test("formatTime renders hours, minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3661)).toBe("1:01:01");
  });

  test("playing the same item again after a pause resumes instead of restarting", async () => {
    const store = newStore();
    store.play(podcastItem());
    await flushPromises();
    latestAudio().currentTime = 30;
    store.pause();

    store.play(store.currentItem);

    expect(latestAudio().play).toHaveBeenCalledTimes(2);
    expect(store.currentItem).not.toBeNull();
  });
});
