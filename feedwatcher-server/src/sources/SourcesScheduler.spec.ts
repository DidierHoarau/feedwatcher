import {
  SourcesSchedulerCycle,
  SourcesSchedulerResetForTests,
} from "./SourcesScheduler";
import {
  SourcesDataListAll,
  SourcesDataWarmItemCounts,
} from "./SourcesData";
import { RulesDataListAll } from "../rules/RulesData";
import { RulesExecutionExecuteUserRules } from "../rules/RulesExecution";
import { SourceItemsDataCleanupOrphans } from "./SourceItemsData";
import { ProcessorsFetchSourceItems } from "../procesors/Processors";
import { ProcessorsPoolResetForTests } from "../procesors/ProcessorsPool";
import { NewsletterAutoRepair } from "./NewsletterProvider";

jest.mock("./NewsletterProvider", () => ({
  NewsletterAutoRepair: jest.fn(),
}));

const mockPoolTasks: Array<() => Promise<any>> = [];

jest.mock("../OTelContext", () => ({
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  OTelTracer: () => ({
    startSpan: () => ({ end: jest.fn() }),
  }),
  OTelMeter: () => ({
    createObservableGauge: jest.fn(),
  }),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataListAll: jest.fn(),
  SourcesDataWarmItemCounts: jest.fn(),
  SourcesDataGetGlobalItemCounts: jest.fn(() => ({
    read: 0,
    unread: 0,
    total: 0,
    bookmarked: 0,
  })),
}));

jest.mock("../rules/RulesData", () => ({
  RulesDataListAll: jest.fn(),
}));

jest.mock("../rules/RulesExecution", () => ({
  RulesExecutionExecuteUserRules: jest.fn(),
}));

jest.mock("./SourceItemsData", () => ({
  SourceItemsDataCleanupOrphans: jest.fn(),
}));

jest.mock("../procesors/Processors", () => ({
  ProcessorsFetchSourceItems: jest.fn(),
}));

jest.mock("../notifications/Notifications", () => ({
  NotificationsCheckNewItems: jest.fn(),
}));

import { NotificationsCheckNewItems } from "../notifications/Notifications";

jest.mock("../utils-std-ts/PromisePool", () => ({
  PromisePool: jest.fn().mockImplementation(() => ({
    add: jest.fn((task: () => Promise<any>) => {
      mockPoolTasks.push(task);
      return Promise.resolve();
    }),
    getQueueLength: jest.fn(() => 0),
    getInFlightCount: jest.fn(() => 0),
  })),
}));

async function runQueuedTasks(): Promise<void> {
  const tasks = [...mockPoolTasks];
  mockPoolTasks.length = 0;
  for (const task of tasks) {
    await task();
  }
}

describe("SourcesSchedulerCycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SourcesSchedulerResetForTests();
    ProcessorsPoolResetForTests();
    mockPoolTasks.length = 0;
    jest.mocked(SourcesDataListAll).mockResolvedValue([]);
    jest.mocked(SourcesDataWarmItemCounts).mockResolvedValue(undefined);
    jest.mocked(RulesDataListAll).mockResolvedValue([]);
    jest.mocked(SourceItemsDataCleanupOrphans).mockResolvedValue(undefined);
    jest.mocked(RulesExecutionExecuteUserRules).mockResolvedValue(undefined);
    jest.mocked(NotificationsCheckNewItems).mockResolvedValue(undefined);
    jest.mocked(NewsletterAutoRepair).mockResolvedValue(undefined);
  });

  test("swallows a failing cycle so the loop can keep iterating (H3)", async () => {
    jest
      .mocked(SourcesDataListAll)
      .mockRejectedValueOnce(new Error("database unavailable"));

    await expect(SourcesSchedulerCycle()).resolves.toBeUndefined();
  });

  test("keeps fetching and executing rules on the next cycle after a failure (H3)", async () => {
    jest
      .mocked(SourcesDataListAll)
      .mockRejectedValueOnce(new Error("database unavailable"));
    await expect(SourcesSchedulerCycle()).resolves.toBeUndefined();

    const source = { id: "source-1", info: {} };
    jest.mocked(SourcesDataListAll).mockResolvedValue([source] as any);
    jest
      .mocked(RulesDataListAll)
      .mockResolvedValue([{ userId: "user-1", info: [] }] as any);

    await expect(SourcesSchedulerCycle()).resolves.toBeUndefined();

    expect(mockPoolTasks.length).toBeGreaterThanOrEqual(2);
    await runQueuedTasks();

    expect(ProcessorsFetchSourceItems).toHaveBeenCalledTimes(1);
    expect(jest.mocked(ProcessorsFetchSourceItems).mock.calls[0][1]).toEqual(
      source
    );
    expect(RulesExecutionExecuteUserRules).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user-1" })
    );
    expect(SourceItemsDataCleanupOrphans).toHaveBeenCalled();
  });

  test("contains a failing fetch task so it cannot break the cycle", async () => {
    jest.mocked(SourcesDataListAll).mockResolvedValue([{ id: "source-1", info: {} }] as any);
    jest
      .mocked(ProcessorsFetchSourceItems)
      .mockRejectedValue(new Error("feed unreachable"));

    await SourcesSchedulerCycle();
    await expect(runQueuedTasks()).resolves.toBeUndefined();
  });

  test("checks new-item notifications each cycle (N1)", async () => {
    await SourcesSchedulerCycle();

    expect(NotificationsCheckNewItems).toHaveBeenCalledTimes(1);
  });

  test("swallows a failing new-item notification check (N1)", async () => {
    jest
      .mocked(NotificationsCheckNewItems)
      .mockRejectedValue(new Error("notification subsystem down"));

    await expect(SourcesSchedulerCycle()).resolves.toBeUndefined();
  });

  test("runs the newsletter source auto-repair each cycle", async () => {
    await SourcesSchedulerCycle();

    expect(NewsletterAutoRepair).toHaveBeenCalledTimes(1);
  });

  test("continues fetching when the newsletter auto-repair fails", async () => {
    jest
      .mocked(NewsletterAutoRepair)
      .mockRejectedValue(new Error("catalogue unavailable"));
    jest.mocked(SourcesDataListAll).mockResolvedValue([
      { id: "source-1", info: {} },
    ] as any);

    await expect(SourcesSchedulerCycle()).resolves.toBeUndefined();
    await runQueuedTasks();

    expect(ProcessorsFetchSourceItems).toHaveBeenCalledTimes(1);
  });

  test("runs orphan cleanup at most once a day and never collects counts per cycle (M2)", async () => {
    jest.useFakeTimers();
    try {
      // Cleanup is where the in-memory totals are reconciled after the deletes.
      jest.mocked(SourceItemsDataCleanupOrphans).mockImplementation(async () => {
        await SourcesDataWarmItemCounts({} as any);
      });

      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await SourcesSchedulerCycle();
      expect(mockPoolTasks.length).toBe(1);
      await runQueuedTasks();
      expect(SourceItemsDataCleanupOrphans).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date("2026-01-01T01:00:00Z"));
      await SourcesSchedulerCycle();
      expect(mockPoolTasks.length).toBe(0);
      expect(SourceItemsDataCleanupOrphans).toHaveBeenCalledTimes(1);
      expect(SourcesDataWarmItemCounts).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date("2026-01-02T02:00:00Z"));
      await SourcesSchedulerCycle();
      expect(mockPoolTasks.length).toBe(1);
      await runQueuedTasks();

      expect(SourceItemsDataCleanupOrphans).toHaveBeenCalledTimes(2);
      expect(SourcesDataWarmItemCounts).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
