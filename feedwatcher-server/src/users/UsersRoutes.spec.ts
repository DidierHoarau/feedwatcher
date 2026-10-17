import Fastify, { FastifyInstance } from "fastify";
import { UsersRoutes } from "./UsersRoutes";
import { AuthGetUserSession } from "./Auth";
import {
  UserPasswordCheckPassword,
  UserPasswordSetPassword,
} from "./UserPassword";
import {
  UsersDataAdd,
  UsersDataGet,
  UsersDataGetByName,
  UsersDataList,
  UsersDataUpdateSettings,
} from "./UsersData";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
}));

jest.mock("./Auth", () => ({
  AuthGetUserSession: jest.fn(),
  AuthGenerateJWT: jest.fn(async () => "jwt-token"),
}));

jest.mock("./UserPassword", () => ({
  UserPasswordCheckPassword: jest.fn(),
  UserPasswordSetPassword: jest.fn(async () => undefined),
}));

jest.mock("./UsersData", () => ({
  UsersDataAdd: jest.fn(async () => undefined),
  UsersDataGet: jest.fn(),
  UsersDataGetByName: jest.fn(),
  UsersDataList: jest.fn(async () => []),
  UsersDataUpdate: jest.fn(async () => undefined),
  UsersDataUpdateSettings: jest.fn(async () => undefined),
}));

jest.mock("@devopsplaybook.io/common-utils", () => ({
  DbUtilsWithLock: jest.fn((_lock: string, callback: () => any) => callback()),
}));

describe("UsersRoutes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    jest.mocked(UsersDataList).mockResolvedValue([]);
    jest.mocked(UsersDataGetByName).mockResolvedValue(null);
    jest.mocked(UsersDataGet).mockResolvedValue(null);
    jest.mocked(UserPasswordCheckPassword).mockResolvedValue(false);
    fastify = Fastify();
    await new UsersRoutes().getRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("returns 401 when refreshing a token of a deleted user (M1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "deleted-user",
    });
    jest.mocked(UsersDataGet).mockResolvedValue(null);

    const response = await fastify.inject({
      method: "POST",
      url: "/session",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  test("returns a fresh token for an existing user (M1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/session",
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).token).toBe("jwt-token");
  });

  test("throttles repeated session attempts from one ip with 429 (M10)", async () => {
    jest.mocked(UsersDataGetByName).mockResolvedValue({
      id: "user-1",
      name: "alice",
      passwordEncrypted: "hash",
    } as any);

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const response = await fastify.inject({
        method: "POST",
        url: "/session",
        payload: { name: "alice", password: "wrong" },
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  test("locks a username after repeated failures from different ips (M10)", async () => {
    jest.mocked(UsersDataGetByName).mockResolvedValue({
      id: "user-1",
      name: "alice",
      passwordEncrypted: "hash",
    } as any);

    let lastStatus = 0;
    for (let i = 0; i < 16; i++) {
      const response = await fastify.inject({
        method: "POST",
        url: "/session",
        payload: { name: "alice", password: "wrong" },
        remoteAddress: `10.0.0.${i + 1}`,
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  test("refuses account creation once users exist with 403 (M14)", async () => {
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([{ id: "user-1", name: "alice" }] as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { name: "bob", password: "secret1234" },
    });
    expect(response.statusCode).toBe(403);
    expect(UsersDataAdd).not.toHaveBeenCalled();
  });

  test("refuses account creation for an authenticated user once users exist (M14)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest
      .mocked(UsersDataList)
      .mockResolvedValue([{ id: "user-1", name: "alice" }] as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { name: "bob", password: "secret1234" },
    });
    expect(response.statusCode).toBe(403);
    expect(UsersDataAdd).not.toHaveBeenCalled();
  });

  test("creates the first user while the user base is empty (M14)", async () => {
    jest.mocked(UsersDataList).mockResolvedValue([]);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { name: "alice", password: "secret1234" },
    });
    expect(response.statusCode).toBe(201);
    expect(UserPasswordSetPassword).toHaveBeenCalled();
    expect(UsersDataAdd).toHaveBeenCalledTimes(1);
  });

  test("rejects account creation without password with 400 (M14)", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { name: "alice" },
    });
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 for GET /settings when unauthenticated (N1)", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/settings",
    });
    expect(response.statusCode).toBe(403);
  });

  test("returns 403 for PUT /settings when unauthenticated (N1)", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/settings",
      payload: { settings: {} },
    });
    expect(response.statusCode).toBe(403);
  });

  test("returns the user settings (N1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
      settings: {
        notifications: { digest: true, newItems: "all", newItemsLabels: [] },
        summaryPrompt: "",
      },
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/settings",
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).settings.notifications.digest).toBe(true);
  });

  test("persists valid settings via UsersDataUpdateSettings (N1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
    } as any);

    const response = await fastify.inject({
      method: "PUT",
      url: "/settings",
      payload: {
        settings: {
          notifications: {
            digest: true,
            newItems: "labels",
            newItemsLabels: ["tech"],
          },
          summaryPrompt: "Custom prompt",
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(UsersDataUpdateSettings).toHaveBeenCalledTimes(1);
    const [_calledSpan, calledUserId, settings] = jest.mocked(
      UsersDataUpdateSettings
    ).mock.calls[0];
    expect(calledUserId).toBe("user-1");
    expect(settings.notifications.digest).toBe(true);
    expect(settings.notifications.newItems).toBe("labels");
    expect(settings.notifications.newItemsLabels).toEqual(["tech"]);
    expect(settings.summaryPrompt).toBe("Custom prompt");
  });

  test("rejects an invalid newItems mode with 400 (N1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
    } as any);

    const response = await fastify.inject({
      method: "PUT",
      url: "/settings",
      payload: {
        settings: {
          notifications: {
            digest: true,
            newItems: "sometimes",
            newItemsLabels: [],
          },
          summaryPrompt: "",
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(UsersDataUpdateSettings).not.toHaveBeenCalled();
  });

  test("rejects a non-string summaryPrompt with 400 (N1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
    } as any);

    const response = await fastify.inject({
      method: "PUT",
      url: "/settings",
      payload: {
        settings: { notifications: {}, summaryPrompt: 42 },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(UsersDataUpdateSettings).not.toHaveBeenCalled();
  });

  test("rejects a missing settings body with 400 (N1)", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(UsersDataGet).mockResolvedValue({
      id: "user-1",
      name: "alice",
    } as any);

    const response = await fastify.inject({
      method: "PUT",
      url: "/settings",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(UsersDataUpdateSettings).not.toHaveBeenCalled();
  });
});
