import Fastify, { FastifyInstance } from "fastify";
import * as dns from "dns";
import { PushRoutes } from "./PushRoutes";
import {
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataUpsert,
} from "./PushSubscriptionsData";
import { AuthGetUserSession } from "../users/Auth";

const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

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
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
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

  test.each([
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::ffff:127.0.0.1]/x",
    "https://10.0.0.1/x",
    "http://push.example.com/x",
    "not-a-url",
  ])("rejects an unsafe subscribe endpoint %s (M4)", async (endpoint) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/subscribe",
      payload: {
        endpoint,
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(PushSubscriptionsDataUpsert).not.toHaveBeenCalled();
  });

  test("rejects an endpoint whose hostname resolves to a private address (M4)", async () => {
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/subscribe",
      payload: {
        endpoint: "https://internal.example/x",
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(PushSubscriptionsDataUpsert).not.toHaveBeenCalled();
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
