import { Span } from "@opentelemetry/sdk-trace-base";
import {
  NotificationsCheckNewItems,
  NotificationsSendDigestForUser,
} from "./Notifications";

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

jest.mock("./PushSender", () => ({
  PushSenderInit: jest.fn(async () => undefined),
  PushSenderIsEnabled: jest.fn(() => true),
  PushSenderSendToUser: jest.fn(async () => 1),
}));

jest.mock("../users/UsersData", () => ({
  UsersDataGet: jest.fn(),
  UsersDataList: jest.fn(),
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  DbUtilsExecSQL: jest.fn(),
  DbUtilsQuerySQL: jest.fn(),
}));

import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import { PushSenderIsEnabled, PushSenderSendToUser } from "./PushSender";
import { UsersDataGet, UsersDataList } from "../users/UsersData";

const span = {} as Span;

function user(id: string, settings: any = undefined) {
  return { id, name: `user-${id}`, settings };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(PushSenderIsEnabled).mockReturnValue(true);
  jest.mocked(PushSenderSendToUser).mockResolvedValue(1);
  jest.mocked(DbUtilsExecSQL).mockResolvedValue(1 as any);
});

describe("NotificationsSendDigestForUser", () => {
  //
  test("sends the digest with a truncated first-line excerpt (N1)", async () => {
    jest.mocked(UsersDataGet).mockResolvedValue(
      user("user-1", {
        notifications: { digest: true, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
      }) as any
    );
    const summary =
      "## Technology\n\n- Big story (Source One)\n\n## Science\n\n- Another story";

    await NotificationsSendDigestForUser(span, "user-1", summary);

    expect(PushSenderSendToUser).toHaveBeenCalledTimes(1);
    const [_calledSpan, calledUser, payload] = jest.mocked(
      PushSenderSendToUser
    ).mock.calls[0];
    expect(calledUser).toBe("user-1");
    expect(payload.title).toBe("FeedWatcher daily digest");
    expect(payload.body).toBe("Technology");
    expect(payload.tag).toBe("fw-digest");
    expect(payload.url).toBe("/");
  });

  test("truncates a long body to 140 chars plus ellipsis (N1)", async () => {
    jest.mocked(UsersDataGet).mockResolvedValue(
      user("user-1", {
        notifications: { digest: true, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
      }) as any
    );
    const summary = "x".repeat(200);

    await NotificationsSendDigestForUser(span, "user-1", summary);

    const payload = jest.mocked(PushSenderSendToUser).mock.calls[0][2];
    expect(payload.body.length).toBe(141);
    expect(payload.body.endsWith("…")).toBe(true);
  });

  test("skips the digest when the user opted out (N1)", async () => {
    jest.mocked(UsersDataGet).mockResolvedValue(
      user("user-1", {
        notifications: { digest: false, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
      }) as any
    );

    await NotificationsSendDigestForUser(span, "user-1", "## Summary");

    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("skips the digest when the summary is empty (N1)", async () => {
    await NotificationsSendDigestForUser(span, "user-1", "");
    await NotificationsSendDigestForUser(span, "user-1", "   ");

    expect(UsersDataGet).not.toHaveBeenCalled();
    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("skips the digest when the sender is disabled (N1)", async () => {
    jest.mocked(PushSenderIsEnabled).mockReturnValue(false);

    await NotificationsSendDigestForUser(span, "user-1", "## Summary");

    expect(UsersDataGet).not.toHaveBeenCalled();
    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("swallows a failing push so summary generation continues (N1)", async () => {
    jest.mocked(UsersDataGet).mockResolvedValue(
      user("user-1", {
        notifications: { digest: true, newItems: "off", newItemsLabels: [] },
        summaryPrompt: "",
      }) as any
    );
    jest
      .mocked(PushSenderSendToUser)
      .mockRejectedValue(new Error("push down"));

    await expect(
      NotificationsSendDigestForUser(span, "user-1", "## Summary")
    ).resolves.toBeUndefined();
  });
});

describe("NotificationsCheckNewItems", () => {
  //
  function newItemsSettings(mode: string, labels: string[] = []) {
    return { notifications: { digest: false, newItems: mode, newItemsLabels: labels } };
  }

  test("does nothing when the sender is disabled (N1)", async () => {
    jest.mocked(PushSenderIsEnabled).mockReturnValue(false);

    await NotificationsCheckNewItems(span);

    expect(UsersDataList).not.toHaveBeenCalled();
  });

  test("skips users with newItems off (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("off"))] as any);

    await NotificationsCheckNewItems(span);

    expect(DbUtilsQuerySQL).not.toHaveBeenCalled();
    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("seeds the watermark on first run without pushing (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("all"))] as any);
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);

    await NotificationsCheckNewItems(span);

    expect(DbUtilsExecSQL).toHaveBeenCalledTimes(1);
    const [_calledSpan, sql, params] = jest.mocked(DbUtilsExecSQL).mock.calls[0];
    expect(sql).toContain("INSERT INTO notification_state");
    expect(params[0]).toBe("user-1");
    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("sends exactly one push and advances the watermark (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("all"))] as any);
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementation(async (_span, sql, _params) => {
        if (String(sql).includes("notification_state")) {
          return [{ userId: "user-1", lastNewItemsAt: "2026-10-16T00:00:00.000Z" }];
        }
        return [
          { id: "i1", title: "First item", datePublished: "2026-10-17T02:00:00.000Z" },
          { id: "i2", title: "Second item", datePublished: "2026-10-17T01:00:00.000Z" },
        ];
      });

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).toHaveBeenCalledTimes(1);
    const [_calledSpan, calledUser, payload] = jest.mocked(
      PushSenderSendToUser
    ).mock.calls[0];
    expect(calledUser).toBe("user-1");
    expect(payload.title).toBe("FeedWatcher");
    expect(payload.body).toBe("2 new item(s) — First item");
    expect(payload.tag).toBe("fw-items");
    expect(payload.url).toBe("/sources");
    const upsert = jest
      .mocked(DbUtilsExecSQL)
      .mock.calls.find((call) =>
        String(call[1]).includes("ON CONFLICT(userId) DO UPDATE")
      );
    expect(upsert).toBeDefined();
    expect(upsert[2]).toEqual(["user-1", "2026-10-17T02:00:00.000Z"]);
  });

  test("queries only the user's unread items newer than the watermark (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("all"))] as any);
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementation(async (_span, sql, params) => {
        if (String(sql).includes("notification_state")) {
          return [{ userId: "user-1", lastNewItemsAt: "2026-10-16T00:00:00.000Z" }];
        }
        expect(String(sql)).toContain("si.status = 'unread'");
        expect(String(sql)).toContain("si.datePublished > ?");
        expect(params[0]).toBe("user-1");
        expect(params[1]).toBe("2026-10-16T00:00:00.000Z");
        return [];
      });

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("filters non-watched labels out in labels mode (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([
        user("user-1", newItemsSettings("labels", ["tech", "news"])),
      ] as any);
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementation(async (_span, sql, params) => {
        if (String(sql).includes("notification_state")) {
          return [{ userId: "user-1", lastNewItemsAt: "2026-10-16T00:00:00.000Z" }];
        }
        expect(String(sql)).toContain("EXISTS (SELECT 1 FROM sources_labels");
        expect(params.slice(2)).toEqual(["tech", "news"]);
        return [];
      });

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("skips labels mode users without any watched label (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("labels", []))] as any);
    jest
      .mocked(DbUtilsQuerySQL)
      .mockResolvedValue([
        { userId: "user-1", lastNewItemsAt: "2026-10-16T00:00:00.000Z" },
      ]);

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).not.toHaveBeenCalled();
  });

  test("one failing user does not stop the others (N1)", async () => {
    jest.mocked(UsersDataList).mockResolvedValue([
      user("user-broken", newItemsSettings("all")),
      user("user-ok", newItemsSettings("all")),
    ] as any);
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementation(async (_span, sql, params) => {
        if (String(sql).includes("notification_state")) {
          if (params[0] === "user-broken") {
            throw new Error("database hiccup");
          }
          return [
            { userId: "user-ok", lastNewItemsAt: "2026-10-16T00:00:00.000Z" },
          ];
        }
        return params[0] === "user-ok"
          ? [
              {
                id: "i1",
                title: "Item",
                datePublished: "2026-10-17T02:00:00.000Z",
              },
            ]
          : [];
      });

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).toHaveBeenCalledTimes(1);
    expect(jest.mocked(PushSenderSendToUser).mock.calls[0][1]).toBe("user-ok");
  });

  test("does not re-push watermarked items (N1)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([user("user-1", newItemsSettings("all"))] as any);
    // First cycle: two new items
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementationOnce(async () => [
        { userId: "user-1", lastNewItemsAt: "2026-10-16T00:00:00.000Z" },
      ])
      .mockImplementationOnce(async () => [
        { id: "i1", title: "Item", datePublished: "2026-10-17T02:00:00.000Z" },
      ]);
    await NotificationsCheckNewItems(span);
    expect(PushSenderSendToUser).toHaveBeenCalledTimes(1);

    // Second cycle: no item newer than the advanced watermark
    jest
      .mocked(DbUtilsQuerySQL)
      .mockImplementationOnce(async () => [
        { userId: "user-1", lastNewItemsAt: "2026-10-17T02:00:00.000Z" },
      ])
      .mockImplementationOnce(async (_span, sql, params) => {
        expect(params[1]).toBe("2026-10-17T02:00:00.000Z");
        return [];
      });

    await NotificationsCheckNewItems(span);

    expect(PushSenderSendToUser).toHaveBeenCalledTimes(1);
  });
});
