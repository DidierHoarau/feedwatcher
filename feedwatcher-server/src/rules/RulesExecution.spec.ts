import { DbUtilsExecSQL } from "@devopsplaybook.io/common-utils";
import { RulesExecutionExecuteUserRules } from "./RulesExecution";

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
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  DbUtilsExecSQL: jest.fn(),
}));

describe("RulesExecutionExecuteUserRules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(DbUtilsExecSQL).mockResolvedValue(1);
  });

  test("does not throw when a stored rules row has a non-array info (C3)", async () => {
    await expect(
      RulesExecutionExecuteUserRules({} as any, {
        userId: "user-1",
        info: null,
      } as any)
    ).resolves.toBeUndefined();

    expect(DbUtilsExecSQL).not.toHaveBeenCalled();
  });

  test("keeps executing the next rule when one rule fails", async () => {
    jest
      .mocked(DbUtilsExecSQL)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(1);

    await expect(
      RulesExecutionExecuteUserRules({} as any, {
        userId: "user-1",
        info: [
          { isRoot: true, autoRead: [{ pattern: "*", ageDays: 1 }] },
          { isRoot: true, autoRead: [{ pattern: "*", ageDays: 2 }] },
        ],
      } as any)
    ).resolves.toBeUndefined();

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(2);
  });

  test("skips patterns with invalid ageDays without touching the database", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [{ isRoot: true, autoRead: [{ pattern: "*", ageDays: "abc" }] }],
    } as any);

    expect(DbUtilsExecSQL).not.toHaveBeenCalled();
  });

  test("sends titles and dates as bound parameters, never interpolated (H1)", async () => {
    const sqlInjectionPayload = "x' OR 1=1 OR ('1'='1";

    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        {
          isRoot: true,
          autoRead: [{ pattern: sqlInjectionPayload, ageDays: 3 }],
        },
      ],
    } as any);

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    const call = jest.mocked(DbUtilsExecSQL).mock.calls[0] as any[];
    const sql = call[1] as string;
    const params = call[2] as any[];
    expect(sql).toContain("sources_items.datePublished <= ?");
    expect(sql).toContain("sources_items.title GLOB ?");
    expect(sql).not.toContain("1=1");
    expect(sql).not.toContain(sqlInjectionPayload);
    expect(params[0]).toBe("user-1");
    expect(params[2]).toBe(sqlInjectionPayload);
  });

  test("deletes matching items for a delete rule with bound parameters", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        {
          isRoot: true,
          autoDelete: [{ pattern: "*", ageDays: 10 }],
        },
      ],
    } as any);

    const call = jest.mocked(DbUtilsExecSQL).mock.calls[0] as any[];
    const sql = call[1] as string;
    const params = call[2] as any[];
    expect(sql).toContain("DELETE FROM sources_items");
    expect(sql).toContain("datePublished <= ?");
    expect(params[0]).toBe("user-1");
    expect(params[1]).toEqual(expect.any(String));
  });
});
