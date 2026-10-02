import Fastify, { FastifyInstance } from "fastify";
import { SourcesLabelsRoutes } from "./SourcesLabelsRoutes";
import { AuthGetUserSession } from "../users/Auth";
import {
  SourcesDataListCountsForUser,
  SourcesDataListCountsSavedForUser,
} from "./SourcesData";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataListCountsForUser: jest.fn(),
  SourcesDataListCountsSavedForUser: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataListForUser: jest.fn(),
}));

describe("SourcesLabelsRoutes (L3)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    } as any);
    fastify = Fastify();
    await new SourcesLabelsRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("GET / returns 200 with source labels", async () => {
    jest.mocked(SourceLabelsDataListForUser).mockResolvedValue([
      {
        sourceName: "Feed",
        sourceInfo: { url: "https://example.com/feed", icon: "rss" },
        labelName: "News",
      },
    ] as any);
    const response = await fastify.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sourceLabels).toHaveLength(1);
    expect(body.sourceLabels[0].sourceInfo.health).toBeDefined();
  });

  test("GET /counts/unread returns 200", async () => {
    jest.mocked(SourcesDataListCountsForUser).mockResolvedValue([] as any);
    const response = await fastify.inject({
      method: "GET",
      url: "/counts/unread",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ counts: [] });
  });

  test("GET /counts/saved returns 200", async () => {
    jest.mocked(SourcesDataListCountsSavedForUser).mockResolvedValue([] as any);
    const response = await fastify.inject({
      method: "GET",
      url: "/counts/saved",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ counts: [] });
  });

  test("GET / is 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    } as any);
    const response = await fastify.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(403);
  });
});
