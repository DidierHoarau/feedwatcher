import Fastify, { FastifyInstance } from "fastify";
import { RulesRoutes } from "./RulesRoutes";
import { RulesDataListForUser, RulesDataUpdate } from "./RulesData";
import { AuthGetUserSession } from "../users/Auth";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./RulesData", () => ({
  RulesDataListForUser: jest.fn(),
  RulesDataUpdate: jest.fn(),
}));

describe("RulesRoutes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    fastify = Fastify();
    await new RulesRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("rejects a rules body whose info is not an array with 400 (C3)", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/",
      payload: { rules: { info: null } },
    });
    expect(response.statusCode).toBe(400);
    expect(RulesDataUpdate).not.toHaveBeenCalled();
  });

  test("rejects a body without rules with 400", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(RulesDataUpdate).not.toHaveBeenCalled();
  });

  test("rejects an info entry whose autoRead is not an array with 400", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/",
      payload: { rules: { info: [{ isRoot: true, autoRead: "not-an-array" }] } },
    });
    expect(response.statusCode).toBe(400);
    expect(RulesDataUpdate).not.toHaveBeenCalled();
  });

  test("stores a valid rules document with 200 and the session user id", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/",
      payload: {
        rules: {
          info: [
            {
              isRoot: true,
              autoRead: [{ pattern: "*", ageDays: "100" }],
              autoDelete: [{ pattern: "*", ageDays: 30 }],
            },
          ],
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(RulesDataUpdate).toHaveBeenCalledTimes(1);
    expect(jest.mocked(RulesDataUpdate).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        userId: "user-1",
        info: [
          expect.objectContaining({
            isRoot: true,
            autoRead: [{ pattern: "*", ageDays: 100 }],
          }),
        ],
      })
    );
  });

  test("returns 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({
      method: "PUT",
      url: "/",
      payload: { rules: { info: [] } },
    });
    expect(response.statusCode).toBe(403);
    expect(RulesDataUpdate).not.toHaveBeenCalled();
  });

  test("returns the user rules with 200", async () => {
    jest.mocked(RulesDataListForUser).mockResolvedValue({
      id: "rules-1",
      userId: "user-1",
      info: [],
    } as any);
    const response = await fastify.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      rules: { id: "rules-1", userId: "user-1", info: [] },
    });
  });
});
