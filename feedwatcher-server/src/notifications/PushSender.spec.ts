import { Span } from "@opentelemetry/sdk-trace-base";
import * as webpush from "web-push";
import { Config } from "../Config";
import {
  PushSenderGetPublicKey,
  PushSenderInit,
  PushSenderIsEnabled,
  PushSenderSendToUser,
} from "./PushSender";

jest.mock("web-push", () => ({
  generateVAPIDKeys: jest.fn(),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

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
  ...jest.requireActual("@devopsplaybook.io/common-utils"),
  DbUtilsWithLock: jest.fn((_lock: string, callback: () => any) => callback()),
  DbUtilsExecSQL: jest.fn(),
  DbUtilsQuerySQL: jest.fn(),
}));

jest.mock("./PushSubscriptionsData", () => ({
  PushSubscriptionsDataListForUser: jest.fn(),
  PushSubscriptionsDataDelete: jest.fn(),
  PushSubscriptionsDataUpsert: jest.fn(),
}));

import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import {
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataListForUser,
} from "./PushSubscriptionsData";

const span = {} as Span;

function newConfig(vapidPublic: string, vapidPrivate: string): Config {
  const config = new Config();
  config.VAPID_PUBLIC_KEY = vapidPublic;
  config.VAPID_PRIVATE_KEY = vapidPrivate;
  config.VAPID_SUBJECT = "";
  return config;
}

function metadataRow(type: string, value: string) {
  return { type, value };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);
  jest.mocked(DbUtilsExecSQL).mockResolvedValue(1 as any);
  jest
    .mocked(PushSubscriptionsDataListForUser)
    .mockResolvedValue([]);
});

describe("PushSenderInit", () => {
  //
  test("uses config keys when provided and syncs them into metadata (N1)", async () => {
    jest
      .mocked(DbUtilsQuerySQL)
      .mockResolvedValue([
        metadataRow("vapid_public_key", "old-public"),
        metadataRow("vapid_private_key", "old-private"),
      ]);

    await PushSenderInit(span, newConfig("cfg-public", "cfg-private"));

    expect(PushSenderIsEnabled()).toBe(true);
    expect(PushSenderGetPublicKey()).toBe("cfg-public");
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:feedwatcher@localhost",
      "cfg-public",
      "cfg-private"
    );
    const upserts = jest
      .mocked(DbUtilsExecSQL)
      .mock.calls.map((call) => ({ sql: call[1], params: call[2] }));
    expect(
      upserts.find((u) => u.params.includes("vapid_public_key")).params[0]
    ).toBe("cfg-public");
    expect(
      upserts.find((u) => u.params.includes("vapid_private_key")).params[0]
    ).toBe("cfg-private");
  });

  test("reuses keys persisted in metadata when config is empty (N1)", async () => {
    jest
      .mocked(DbUtilsQuerySQL)
      .mockResolvedValue([
        metadataRow("vapid_public_key", "stored-public"),
        metadataRow("vapid_private_key", "stored-private"),
      ]);

    await PushSenderInit(span, newConfig("", ""));

    expect(PushSenderIsEnabled()).toBe(true);
    expect(PushSenderGetPublicKey()).toBe("stored-public");
    expect(webpush.generateVAPIDKeys).not.toHaveBeenCalled();
    expect(DbUtilsExecSQL).not.toHaveBeenCalled();
  });

  test("generates and persists keys when none exist anywhere (N1)", async () => {
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);
    jest.mocked(webpush.generateVAPIDKeys).mockReturnValue({
      publicKey: "generated-public",
      privateKey: "generated-private",
    });

    await PushSenderInit(span, newConfig("", ""));

    expect(PushSenderIsEnabled()).toBe(true);
    expect(PushSenderGetPublicKey()).toBe("generated-public");
    expect(webpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    const inserts = jest
      .mocked(DbUtilsExecSQL)
      .mock.calls.map((call) => ({ sql: call[1], params: call[2] }));
    expect(inserts.length).toBe(2);
    expect(inserts[0].sql).toContain("INSERT INTO metadata");
    expect(inserts[0].params).toContain("vapid_public_key");
    expect(inserts[0].params).toContain("generated-public");
    expect(inserts[1].params).toContain("vapid_private_key");
    expect(inserts[1].params).toContain("generated-private");
  });

  test("disables the sender without crashing when init fails (N1)", async () => {
    jest
      .mocked(DbUtilsQuerySQL)
      .mockRejectedValue(new Error("database unavailable"));

    await expect(
      PushSenderInit(span, newConfig("", ""))
    ).resolves.toBeUndefined();

    expect(PushSenderIsEnabled()).toBe(false);
    expect(PushSenderGetPublicKey()).toBe("");
  });

  test("uses the configured subject when provided (N1)", async () => {
    const config = newConfig("cfg-public", "cfg-private");
    config.VAPID_SUBJECT = "mailto:ops@example.com";

    await PushSenderInit(span, config);

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:ops@example.com",
      "cfg-public",
      "cfg-private"
    );
  });
});

describe("PushSenderSendToUser", () => {
  //
  test("sends the JSON payload to every subscription (N1)", async () => {
    jest
      .mocked(PushSubscriptionsDataListForUser)
      .mockResolvedValue([
        {
          endpoint: "https://push.example.com/sub-1",
          keys: { p256dh: "k1", auth: "a1" },
        },
        {
          endpoint: "https://push.example.com/sub-2",
          keys: { p256dh: "k2", auth: "a2" },
        },
      ]);
    jest.mocked(webpush.sendNotification).mockResolvedValue(undefined);
    await PushSenderInit(span, newConfig("cfg-public", "cfg-private"));

    const sent = await PushSenderSendToUser(span, "user-1", {
      title: "Hello",
    });

    expect(sent).toBe(2);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(
      jest.mocked(webpush.sendNotification).mock.calls[0][1]
    ).toBe(JSON.stringify({ title: "Hello" }));
  });

  test("removes the subscription on 404/410 (N1)", async () => {
    jest
      .mocked(PushSubscriptionsDataListForUser)
      .mockResolvedValue([
        {
          endpoint: "https://push.example.com/gone",
          keys: { p256dh: "k1", auth: "a1" },
        },
      ]);
    jest.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error("gone"), { statusCode: 410 })
    );
    await PushSenderInit(span, newConfig("cfg-public", "cfg-private"));

    const sent = await PushSenderSendToUser(span, "user-1", {});

    expect(sent).toBe(0);
    expect(PushSubscriptionsDataDelete).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "https://push.example.com/gone"
    );
  });

  test("swallows other per-subscription errors (N1)", async () => {
    jest
      .mocked(PushSubscriptionsDataListForUser)
      .mockResolvedValue([
        {
          endpoint: "https://push.example.com/failing",
          keys: { p256dh: "k1", auth: "a1" },
        },
        {
          endpoint: "https://push.example.com/ok",
          keys: { p256dh: "k2", auth: "a2" },
        },
      ]);
    jest
      .mocked(webpush.sendNotification)
      .mockRejectedValueOnce(
        Object.assign(new Error("boom"), { statusCode: 500 })
      )
      .mockResolvedValueOnce(undefined as any);
    await PushSenderInit(span, newConfig("cfg-public", "cfg-private"));

    const sent = await PushSenderSendToUser(span, "user-1", {});

    expect(sent).toBe(1);
    expect(PushSubscriptionsDataDelete).not.toHaveBeenCalled();
  });

  test("is a no-op when the sender is disabled (N1)", async () => {
    jest
      .mocked(DbUtilsQuerySQL)
      .mockRejectedValue(new Error("database unavailable"));
    await PushSenderInit(span, newConfig("", ""));

    const sent = await PushSenderSendToUser(span, "user-1", { title: "x" });

    expect(sent).toBe(0);
    expect(PushSubscriptionsDataListForUser).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
