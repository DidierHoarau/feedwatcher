import { SourcesSchedulerCycle } from "./SourcesScheduler";
import { SourcesDataListAll, SourcesDataListCountsSaved } from "./SourcesData";
import { RulesDataListAll } from "../rules/RulesData";
import { RulesExecutionExecuteUserRules } from "../rules/RulesExecution";
import {
  SourceItemsDataCleanupOrphans,
  SourceItemsDataGetCount,
} from "./SourceItemsData";
import { ProcessorsFetchSourceItems } from "../procesors/Processors";

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
  SourcesDataListCountsSaved: jest.fn(),
}));

jest.mock("../rules/RulesData", () => ({
  RulesDataListAll: jest.fn(),
}));

jest.mock("../rules/RulesExecution", () => ({
  RulesExecutionExecuteUserRules: jest.fn(),
}));

jest.mock("./SourceItemsData", () => ({
  SourceItemsDataCleanupOrphans: jest.fn(),
  SourceItemsDataGetCount: jest.fn(),
}));

jest.mock("../procesors/Processors", () => ({
  ProcessorsFetchSourceItems: jest.fn(),
}));

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
    mockPoolTasks.length = 0;
    jest.mocked(SourcesDataListAll).mockResolvedValue([]);
    jest.mocked(RulesDataListAll).mockResolvedValue([]);
    jest.mocked(SourcesDataListCountsSaved).mockResolvedValue(0);
    jest.mocked(SourceItemsDataGetCount).mockResolvedValue(0);
    jest.mocked(SourceItemsDataCleanupOrphans).mockResolvedValue(undefined);
    jest.mocked(RulesExecutionExecuteUserRules).mockResolvedValue(undefined);
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
});
