import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SourceItemsStore } from "~~/stores/SourceItemsStore";

vi.mock("axios");

function newStore() {
  setActivePinia(createPinia());
  return SourceItemsStore();
}

function page(items: any[], hasMore = false, cursor: any = null) {
  return {
    data: { sourceItems: items, pageHasMore: hasMore, nextCursor: cursor },
  };
}

const CURSOR_1 = {
  datePublished: "2026-01-01T00:00:00.000Z",
  id: "item-50",
};

describe("SourceItemsStore pagination (M2)", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  test("first page sends no cursor, loading more sends the returned cursor", async () => {
    const store = newStore();
    vi.mocked(axios.post).mockResolvedValueOnce(
      page([{ id: "item-50" }], true, CURSOR_1),
    );
    await store.fetch();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty("cursor");
    expect(store.pageHasMore).toBe(true);
    expect(store.nextCursor).toEqual(CURSOR_1);

    vi.mocked(axios.post).mockResolvedValueOnce(page([{ id: "item-51" }]));
    await store.fetchMore();
    expect(axios.post.mock.calls[1][1]).toMatchObject({
      cursor: CURSOR_1,
      searchCriteria: "all",
      filterStatus: "unread",
    });
    expect(store.sourceItems.map((item: any) => item.id)).toEqual([
      "item-50",
      "item-51",
    ]);
    expect(store.pageHasMore).toBe(false);
    expect(store.nextCursor).toBeNull();
  });

  test("appending a page dedupes items already present", async () => {
    const store = newStore();
    vi.mocked(axios.post).mockResolvedValueOnce(
      page([{ id: "a" }, { id: "b" }], true, CURSOR_1),
    );
    await store.fetch();
    vi.mocked(axios.post).mockResolvedValueOnce(page([{ id: "b" }, { id: "c" }]));
    await store.fetchMore();
    expect(store.sourceItems.map((item: any) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("a stale in-flight response cannot overwrite a newer fetch", async () => {
    vi.useFakeTimers();
    try {
      const store = newStore();
      let resolveFirst: (value: any) => void;
      vi.mocked(axios.post).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      const firstFetch = store.fetch();
      await vi.advanceTimersByTimeAsync(10); // first request is now in flight
      expect(axios.post).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 1000);
      vi.mocked(axios.post).mockResolvedValueOnce(page([{ id: "fresh" }]));
      const secondFetch = store.fetch();
      await vi.advanceTimersByTimeAsync(10);
      await secondFetch;
      expect(store.sourceItems.map((item: any) => item.id)).toEqual(["fresh"]);

      resolveFirst!(page([{ id: "stale" }], true, CURSOR_1));
      await firstFetch;
      expect(store.sourceItems.map((item: any) => item.id)).toEqual(["fresh"]);
      expect(store.nextCursor).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
