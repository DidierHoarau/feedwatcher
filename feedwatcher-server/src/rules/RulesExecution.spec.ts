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

jest.mock("../sources/SourcesData", () => ({
  SourcesDataInvalidateUserCache: jest.fn(async () => undefined),
}));

import { SourcesDataInvalidateUserCache } from "../sources/SourcesData";

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
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
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
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
  });

  test("invalidates the user count cache once per run across rules and scopes", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        { isRoot: true, autoRead: [{ pattern: "*", ageDays: 1 }] },
        { labelName: "news", autoRead: [{ pattern: "*", ageDays: 2 }] },
        { sourceId: "source-1", autoDelete: [{ pattern: "*", ageDays: 3 }] },
      ],
    } as any);

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(3);
    expect(SourcesDataInvalidateUserCache).toHaveBeenCalledTimes(1);
    expect(jest.mocked(SourcesDataInvalidateUserCache)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
  });

  test("does not invalidate the cache when no rule action ran", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        { isRoot: true, autoRead: [{ pattern: "*", ageDays: -1 }] },
        { autoRead: [{ pattern: "*", ageDays: 1 }] },
        {},
      ],
    } as any);

    expect(DbUtilsExecSQL).not.toHaveBeenCalled();
    expect(SourcesDataInvalidateUserCache).not.toHaveBeenCalled();
  });

  test("matches a label exactly or as a hierarchy, never as a raw prefix", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [{ labelName: "news", autoRead: [{ pattern: "*", ageDays: 7 }] }],
    } as any);

    const call = jest.mocked(DbUtilsExecSQL).mock.calls[0] as any[];
    const sql = call[1] as string;
    const params = call[2] as any[];
    expect(sql).toContain(
      "AND (sources_labels.name = ? OR sources_labels.name LIKE ?)",
    );
    expect(params[0]).toBe("user-1");
    expect(params[1]).toBe("news");
    expect(params[2]).toBe("news/%");
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

  test("scopes a source read rule to the rule owner (cross-tenant)", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        {
          sourceId: "source-of-user-2",
          autoRead: [{ pattern: "*", ageDays: 3 }],
        },
      ],
    } as any);

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    const call = jest.mocked(DbUtilsExecSQL).mock.calls[0] as any[];
    const sql = call[1] as string;
    const params = call[2] as any[];
    expect(sql).toContain("UPDATE sources_items SET status = 'read'");
    expect(sql).toContain("sources_items.sourceId = ?");
    expect(sql).toContain(
      "SELECT id FROM sources WHERE userId = ?"
    );
    expect(params[0]).toBe("source-of-user-2");
    expect(params[1]).toBe("user-1");
    expect(params[2]).toEqual(expect.any(String));
    expect(params).not.toContain("user-2");
  });

  test("scopes a source delete rule to the rule owner (cross-tenant)", async () => {
    await RulesExecutionExecuteUserRules({} as any, {
      userId: "user-1",
      info: [
        {
          sourceId: "source-of-user-2",
          autoDelete: [{ pattern: "*", ageDays: 10 }],
        },
      ],
    } as any);

    const call = jest.mocked(DbUtilsExecSQL).mock.calls[0] as any[];
    const sql = call[1] as string;
    const params = call[2] as any[];
    expect(sql).toContain("DELETE FROM sources_items");
    expect(sql).toContain(
      "sources_items.sourceId IN ( SELECT id FROM sources WHERE userId = ? )"
    );
    expect(params[0]).toBe("source-of-user-2");
    expect(params[1]).toBe("user-1");
    expect(params).not.toContain("user-2");
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
