import { Span } from "@opentelemetry/sdk-trace-base";
import { DbUtilsExecSQL } from "@devopsplaybook.io/common-utils";
import { SourceLabelsDataSetSourceLabels } from "./SourceLabelsData";
import {
  SourcesDataGet,
  SourcesDataInvalidateUserCache,
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
  DbUtilsExecSQL: jest.fn(),
  DbUtilsQuerySQL: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataGet: jest.fn(),
  SourcesDataInvalidateUserCache: jest.fn(async () => undefined),
}));

const span = {} as Span;

describe("SourceLabelsDataSetSourceLabels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SourcesDataGet).mockResolvedValue({
      id: "source-1",
      userId: "user-1",
    } as any);
    jest.mocked(DbUtilsExecSQL).mockResolvedValue(1 as any);
  });

  test("writes the labels sequentially after the delete and invalidates the cache", async () => {
    const events: string[] = [];
    jest
      .mocked(DbUtilsExecSQL)
      .mockImplementation(async (_span, sql, params: any[]) => {
        events.push(
          String(sql).startsWith("DELETE") ? "delete" : String(params[2]),
        );
        return 1 as any;
      });

    await SourceLabelsDataSetSourceLabels(span, "source-1", [
      " news ",
      "tech",
    ]);

    expect(events).toEqual(["delete", "news", "tech"]);
    expect(jest.mocked(DbUtilsExecSQL).mock.calls[0][1]).toContain(
      "DELETE FROM sources_labels",
    );
    expect(SourcesDataInvalidateUserCache).toHaveBeenCalledTimes(1);
    expect(SourcesDataInvalidateUserCache).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
  });

  test("an empty label list only deletes and still invalidates the cache", async () => {
    await SourceLabelsDataSetSourceLabels(span, "source-1", []);

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    expect(jest.mocked(DbUtilsExecSQL).mock.calls[0][1]).toContain(
      "DELETE FROM sources_labels",
    );
    expect(SourcesDataInvalidateUserCache).toHaveBeenCalledTimes(1);
  });

  test("propagates an insert failure and does not invalidate the cache", async () => {
    const inserted: string[] = [];
    jest
      .mocked(DbUtilsExecSQL)
      .mockImplementation(async (_span, sql, params: any[]) => {
        if (String(sql).startsWith("DELETE")) {
          return 1 as any;
        }
        inserted.push(String(params[2]));
        if (inserted.length === 2) {
          throw new Error("insert failed");
        }
        return 1 as any;
      });

    await expect(
      SourceLabelsDataSetSourceLabels(span, "source-1", [
        "news",
        "tech",
        "sports",
      ]),
    ).rejects.toThrow("insert failed");

    expect(inserted).toEqual(["news", "tech"]);
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
  });
});
