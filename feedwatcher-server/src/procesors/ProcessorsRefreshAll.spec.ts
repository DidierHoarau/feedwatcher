import { ProcessorsFetchSourceItemsForUser } from "./Processors";
import { ProcessorsPoolGet } from "./ProcessorsPool";
import { SourcesDataListForUser } from "../sources/SourcesData";

const mockStartSpan = jest.fn(() => ({ end: jest.fn() }));

jest.mock("../OTelContext", () => ({
  OTelTracer: () => ({ startSpan: mockStartSpan }),
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("./ProcessorsPool", () => ({
  ProcessorsPoolGet: jest.fn(),
}));

jest.mock("../sources/SourcesData", () => ({
  SourcesDataListForUser: jest.fn(),
  SourcesDataUpdate: jest.fn(),
}));

describe("ProcessorsFetchSourceItemsForUser (M9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSpan.mockClear();
  });

  test("enqueues every source into the shared bounded pool instead of fetching sequentially", async () => {
    const tasks: Array<(signal: AbortSignal) => Promise<void>> = [];
    const add = jest.fn((task: (signal: AbortSignal) => Promise<void>) => {
      tasks.push(task);
      return Promise.resolve();
    });
    jest.mocked(ProcessorsPoolGet).mockReturnValue({ add } as any);
    jest
      .mocked(SourcesDataListForUser)
      .mockResolvedValue([
        { id: "source-1" },
        { id: "source-2" },
        { id: "source-3" },
      ] as any);

    await ProcessorsFetchSourceItemsForUser({} as any, "user-1");

    expect(ProcessorsPoolGet).toHaveBeenCalled();
    expect(SourcesDataListForUser).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
    expect(add).toHaveBeenCalledTimes(3);
    expect(tasks).toHaveLength(3);
    expect(mockStartSpan).toHaveBeenCalledWith(
      "ProcessorsFetchSourceItemsForUser",
      expect.anything(),
    );
    expect(mockStartSpan.mock.results[0].value.end).toHaveBeenCalledTimes(1);
  });
});
