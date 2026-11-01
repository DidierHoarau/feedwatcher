import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import {
  SourcesDataInvalidateUserCache,
  SourcesDataResetCountsForTests,
} from "./SourcesData";

jest.mock("../OTelContext", () => ({
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  OTelTracer: () => ({
    startSpan: () => ({ end: jest.fn(), setAttribute: jest.fn() }),
  }),
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  ...jest.requireActual("@devopsplaybook.io/common-utils"),
  DbUtilsQuerySQL: jest.fn(),
}));

describe("SourcesDataInvalidateUserCache (M5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SourcesDataResetCountsForTests();
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);
  });

  test("coalesces 50 rapid invalidations into at most 2 aggregate refreshes", async () => {
    jest.useFakeTimers();
    try {
      await SourcesDataInvalidateUserCache({} as any, "user-burst");
      // First refresh outside the throttle window: 3 aggregate queries
      const afterFirstRefresh = jest.mocked(DbUtilsQuerySQL).mock.calls.length;
      expect(afterFirstRefresh).toBe(3);

      for (let i = 0; i < 50; i++) {
        await SourcesDataInvalidateUserCache({} as any, "user-burst");
      }
      // Inside the window: no per-mutation aggregate query
      expect(jest.mocked(DbUtilsQuerySQL).mock.calls.length).toBe(
        afterFirstRefresh
      );

      await jest.advanceTimersByTimeAsync(2000);

      // One single trailing refresh: 3 immediate + 3 trailing queries total
      const totalCalls = jest.mocked(DbUtilsQuerySQL).mock.calls.length;
      expect(totalCalls).toBe(6);
    } finally {
      jest.useRealTimers();
    }
  });

  test("swallows refresh errors instead of rejecting the caller", async () => {
    jest.mocked(DbUtilsQuerySQL).mockRejectedValue(new Error("db down"));

    await expect(
      SourcesDataInvalidateUserCache({} as any, "user-error")
    ).resolves.toBeUndefined();
  });

  test("each invalidation call evicts both count caches immediately", async () => {
    // Warm both caches through a normal (non-invalidation) read path
    const [
      { SourcesDataListCountsForUser, SourcesDataListCountsSavedForUser },
    ] = [await import("./SourcesData")].map((mod) => mod) as any;
    await SourcesDataListCountsForUser({} as any, "user-cache");
    await SourcesDataListCountsSavedForUser({} as any, "user-cache");
    const callsAfterWarmup = jest.mocked(DbUtilsQuerySQL).mock.calls.length;

    // Cached reads do not hit the database
    await SourcesDataListCountsForUser({} as any, "user-cache");
    await SourcesDataListCountsSavedForUser({} as any, "user-cache");
    expect(jest.mocked(DbUtilsQuerySQL).mock.calls.length).toBe(
      callsAfterWarmup
    );

    // Invalidation refreshes all aggregates (outside the throttle window)
    await SourcesDataInvalidateUserCache({} as any, "user-cache");
    expect(jest.mocked(DbUtilsQuerySQL).mock.calls.length).toBe(
      callsAfterWarmup + 3
    );
  });
});
