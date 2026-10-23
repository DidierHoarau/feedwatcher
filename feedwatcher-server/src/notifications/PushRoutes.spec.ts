import Fastify, { FastifyInstance } from "fastify";
import { PushRoutes } from "./PushRoutes";
import {
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataUpsert,
} from "./PushSubscriptionsData";
import { AuthGetUserSession } from "../users/Auth";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./PushSubscriptionsData", () => ({
  PushSubscriptionsDataDelete: jest.fn(),
  PushSubscriptionsDataUpsert: jest.fn(),
}));

describe("PushRoutes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    fastify = Fastify();
    await new PushRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("scopes the unsubscribe to the calling user (cross-tenant)", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: { endpoint: "https://push.example.com/sub-of-user-2" },
    });

    expect(response.statusCode).toBe(201);
    expect(PushSubscriptionsDataDelete).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "https://push.example.com/sub-of-user-2"
    );
  });

  test("rejects an unsubscribe without endpoint with 400", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(PushSubscriptionsDataDelete).not.toHaveBeenCalled();
  });

  test("returns 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: { endpoint: "https://push.example.com/sub-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(PushSubscriptionsDataDelete).not.toHaveBeenCalled();
  });

  test("subscribes the calling user", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/subscribe",
      payload: {
        endpoint: "https://push.example.com/sub-1",
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(PushSubscriptionsDataUpsert).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      {
        endpoint: "https://push.example.com/sub-1",
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      }
    );
  });
});
