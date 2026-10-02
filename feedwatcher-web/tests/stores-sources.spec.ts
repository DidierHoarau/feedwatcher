import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SourcesStore } from "~~/stores/SourcesStore";

vi.mock("axios");

// Sorted by (labelName, sourceName), as the server returns them.
const SOURCE_LABELS = [
  { sourceId: "s3", sourceName: "Three", labelName: "", sourceInfo: {} },
  { sourceId: "s1", sourceName: "One", labelName: "news", sourceInfo: {} },
  {
    sourceId: "s2",
    sourceName: "Two",
    labelName: "news/tech",
    sourceInfo: {},
  },
];

function mockApi(unread: any[], saved: any[]) {
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.endsWith("/sources/labels")) {
      return Promise.resolve({ data: { sourceLabels: SOURCE_LABELS } });
    }
    if (url.endsWith("/counts/unread")) {
      return Promise.resolve({ data: { counts: unread } });
    }
    if (url.endsWith("/counts/saved")) {
      return Promise.resolve({ data: { counts: saved } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

function newStore() {
  setActivePinia(createPinia());
  return SourcesStore();
}

describe("SourcesStore count assignment (L7)", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  test("assigns per-source counts and aggregates them per label", async () => {
    mockApi(
      [
        { sourceId: "s1", unreadCount: 5 },
        { sourceId: "s2", unreadCount: 2 },
        { sourceId: "s3", unreadCount: 1 },
      ],
      [{ sourceId: "s1", savedCount: 3 }],
    );
    const store = newStore();
    await store.fetch();

    const bySourceId = (id: string) =>
      store.sources.find((s: any) => s.sourceId === id) as any;
    const byLabel = (name: string) =>
      store.sources.find(
        (s: any) => s.isLabel && s.labelName === name,
      ) as any;
    const root = store.sources.find((s: any) => s.isRoot) as any;

    expect(store.sources.length).toBe(6);
    expect(bySourceId("s1").unreadCount).toBe(5);
    expect(bySourceId("s2").unreadCount).toBe(2);
    expect(bySourceId("s3").unreadCount).toBe(1);
    // "news" aggregates its own sources and those of "news/tech".
    expect(byLabel("news").unreadCount).toBe(7);
    expect(byLabel("news/tech").unreadCount).toBe(2);
    expect(root.unreadCount).toBe(8);
    expect(store.totalUnreadCount).toBe(8);

    // Sources missing from the count response default to 0.
    expect(bySourceId("s1").savedCount).toBe(3);
    expect(bySourceId("s2").savedCount).toBe(0);
    expect(bySourceId("s3").savedCount).toBe(0);
    expect(byLabel("news").savedCount).toBe(3);
    expect(root.savedCount).toBe(3);
  });

  test("re-running assignment recomputes instead of accumulating", async () => {
    mockApi(
      [{ sourceId: "s1", unreadCount: 5 }],
      [],
    );
    const store = newStore();
    await store.fetch();
    expect(
      (store.sources.find((s: any) => s.labelName === "news" && s.isLabel) as any)
        .unreadCount,
    ).toBe(5);

    mockApi([{ sourceId: "s1", unreadCount: 4 }], []);
    await store.fetch();
    const newsLabel = store.sources.find(
      (s: any) => s.labelName === "news" && s.isLabel,
    ) as any;
    expect(newsLabel.unreadCount).toBe(4);
    expect(store.totalUnreadCount).toBe(4);
  });
});
