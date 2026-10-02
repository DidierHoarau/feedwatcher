import Fastify, { FastifyInstance } from "fastify";
import { Source } from "../model/Source";
import { SourcesIdRoutes } from "./SourcesIdRoutes";
import { AuthGetUserSession } from "../users/Auth";
import {
  SourcesDataDelete,
  SourcesDataGet,
  SourcesDataUpdate,
} from "./SourcesData";
import {
  SourceLabelsDataGetSourceLabels,
  SourceLabelsDataSetSourceLabels,
} from "./SourceLabelsData";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
} from "../procesors/Processors";

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
  SourcesDataGet: jest.fn(),
  SourcesDataUpdate: jest.fn(),
  SourcesDataDelete: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataGetSourceLabels: jest.fn(),
  SourceLabelsDataSetSourceLabels: jest.fn(),
}));

jest.mock("../procesors/Processors", () => ({
  ProcessorsCheckSource: jest.fn(),
  ProcessorsFetchSourceItems: jest.fn(),
}));

function newSource(userId: string): Source {
  const source = new Source();
  source.id = "source-1";
  source.userId = userId;
  source.name = "My Feed";
  source.info = { url: "https://example.com/feed" };
  return source;
}

describe("SourcesIdRoutes (M1/L3)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    } as any);
    jest.mocked(ProcessorsCheckSource).mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItems).mockResolvedValue(undefined);
    fastify = Fastify();
    await fastify.register(new SourcesIdRoutes().getRoutes, {
      prefix: "/api/sources/:sourceId",
    });
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("GET an unknown source id returns 404 (no null deref)", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(null);
    const response = await fastify.inject({
      method: "GET",
      url: "/api/sources/source-1",
    });
    expect(response.statusCode).toBe(404);
  });

  test("GET another user's source returns 403", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-2"));
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(403);
  });

  test("GET an owned source returns 200", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).id).toBe("source-1");
  });

  test("PUT without a name returns 400, not 401", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(SourcesDataUpdate).not.toHaveBeenCalled();
  });

  test("PUT a valid update returns 200 and persists it", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataSetSourceLabels).mockResolvedValue(undefined);
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/sources/source-1",
      payload: { name: "Renamed", labels: ["News"] },
    });
    expect(response.statusCode).toBe(200);
    expect(SourcesDataUpdate).toHaveBeenCalled();
    expect(SourceLabelsDataSetSourceLabels).toHaveBeenCalledWith(
      expect.anything(),
      "source-1",
      ["News"]
    );
  });

  test("DELETE an owned source returns 204", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourcesDataDelete).mockResolvedValue(undefined);
    const response = await fastify.inject({ method: "DELETE", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(204);
    expect(SourcesDataDelete).toHaveBeenCalledWith(
      expect.anything(),
      "source-1"
    );
  });

  test("DELETE an unknown source returns 404", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(null);
    const response = await fastify.inject({ method: "DELETE", url: "/api/sources/source-1" });
    expect(response.statusCode).toBe(404);
    expect(SourcesDataDelete).not.toHaveBeenCalled();
  });

  test("GET labels of an owned source returns 200", async () => {
    jest.mocked(SourcesDataGet).mockResolvedValue(newSource("user-1"));
    jest.mocked(SourceLabelsDataGetSourceLabels).mockResolvedValue([ "News" ] as any);
    const response = await fastify.inject({ method: "GET", url: "/api/sources/source-1/labels" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ labels: ["News"] });
  });
});
