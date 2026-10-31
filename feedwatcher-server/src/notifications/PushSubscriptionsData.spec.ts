import { Span } from "@opentelemetry/sdk-trace";
import {
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataListForUser,
  PushSubscriptionsDataUpsert,
} from "./PushSubscriptionsData";

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
  DbUtilsQuerySQL: jest.fn(),
}));

import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";

const span = {} as Span;

function subscription(overrides: any = {}) {
  return {
    endpoint: "https://push.example.com/sub-1",
    keys: { p256dh: "key-p256dh", auth: "key-auth" },
    ...overrides,
  };
}

describe("PushSubscriptionsData", () => {
  //
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("inserts a new subscription (N1)", async () => {
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);

    await PushSubscriptionsDataUpsert(span, "user-1", subscription());

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    const [_calledSpan, sql, params] = jest.mocked(DbUtilsExecSQL).mock.calls[0];
    expect(sql).toContain("INSERT INTO push_subscriptions");
    expect(params).toEqual([
      expect.any(String),
      "user-1",
      "https://push.example.com/sub-1",
      "key-p256dh",
      "key-auth",
      expect.any(String),
    ]);
  });

  test("updates the row when the endpoint already exists (N1)", async () => {
    jest
      .mocked(DbUtilsQuerySQL)
      .mockResolvedValue([{ id: "existing-id" }]);

    await PushSubscriptionsDataUpsert(span, "user-2", subscription());

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    const [_calledSpan, sql, params] = jest.mocked(DbUtilsExecSQL).mock.calls[0];
    expect(sql).toContain("UPDATE push_subscriptions");
    expect(sql).not.toContain("INSERT INTO push_subscriptions");
    expect(params).toEqual([
      "user-2",
      "key-p256dh",
      "key-auth",
      "https://push.example.com/sub-1",
    ]);
  });

  test("lists subscriptions of one user only (N1)", async () => {
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([
      {
        endpoint: "https://push.example.com/sub-1",
        p256dh: "key-p256dh",
        auth: "key-auth",
      },
    ]);

    const result = await PushSubscriptionsDataListForUser(span, "user-1");

    const [_calledSpan, sql, params] = jest.mocked(DbUtilsQuerySQL).mock.calls[0];
    expect(sql).toContain("WHERE userId = ?");
    expect(params).toEqual(["user-1"]);
    expect(result).toEqual([
      {
        endpoint: "https://push.example.com/sub-1",
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      },
    ]);
  });

  test("deletes only the caller's own subscription (cross-tenant)", async () => {
    await PushSubscriptionsDataDelete(
      span,
      "user-1",
      "https://push.example.com/sub-1"
    );

    const [_calledSpan, sql, params] = jest.mocked(DbUtilsExecSQL).mock.calls[0];
    expect(sql).toContain("DELETE FROM push_subscriptions");
    expect(sql).toContain("WHERE userId = ? AND endpoint = ?");
    expect(params).toEqual(["user-1", "https://push.example.com/sub-1"]);
  });
});
