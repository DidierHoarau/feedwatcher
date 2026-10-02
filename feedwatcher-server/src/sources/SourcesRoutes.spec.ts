import Fastify, { FastifyInstance } from "fastify";
import { SourcesRoutes } from "./SourcesRoutes";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
  ProcessorsFetchSourceItemsForUser,
} from "../procesors/Processors";
import { AuthGetUserSession } from "../users/Auth";

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

jest.mock("../procesors/Processors", () => ({
  ProcessorsCheckSource: jest.fn(),
  ProcessorsFetchSourceItems: jest.fn(),
  ProcessorsFetchSourceItemsForUser: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataAdd: jest.fn(),
  SourcesDataListForUser: jest.fn(),
}));

describe("SourcesRoutes", () => {
  let fastify: FastifyInstance;
  const unhandledRejections: unknown[] = [];
  const unhandledHandler = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    unhandledRejections.length = 0;
    process.on("unhandledRejection", unhandledHandler);
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);
    jest.mocked(SourcesDataAdd).mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItems).mockResolvedValue(undefined);
    jest.mocked(ProcessorsFetchSourceItemsForUser).mockResolvedValue(undefined);
    jest.mocked(ProcessorsCheckSource).mockImplementation(async (_span, source: any) => {
      source.info.processorPath = "/processors/800-RssProcessor.js";
      return null;
    });
    fastify = Fastify();
    await new SourcesRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandledHandler);
  });

  test("responds 201 when the background fetch fails, without an unhandled rejection (C2)", async () => {
    jest
      .mocked(ProcessorsFetchSourceItems)
      .mockRejectedValue(new Error("malformed feed"));

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed.xml" },
    });

    expect(response.statusCode).toBe(201);
    expect(ProcessorsFetchSourceItems).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandledRejections).toEqual([]);
  });

  test("responds 200 on manual fetch even when the fetch fails (C2)", async () => {
    jest
      .mocked(ProcessorsFetchSourceItemsForUser)
      .mockRejectedValue(new Error("malformed feed"));

    const response = await fastify.inject({ method: "PUT", url: "/fetch" });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandledRejections).toEqual([]);
  });

  test("rejects a source with no url with 400", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("rejects a duplicate normalized url with 409 (M15)", async () => {
    jest.mocked(SourcesDataListForUser).mockResolvedValue([
      { info: { url: "https://example.com/feed" } },
    ] as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://EXAMPLE.com/feed/" },
    });

    expect(response.statusCode).toBe(409);
    expect(ProcessorsFetchSourceItems).not.toHaveBeenCalled();
  });

  test("accepts the same url for a different user (M15)", async () => {
    jest.mocked(SourcesDataListForUser).mockResolvedValue([]);

    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed" },
    });

    expect(response.statusCode).toBe(201);
  });

  test("responds 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({
      method: "POST",
      url: "/",
      payload: { url: "https://example.com/feed.xml" },
    });
    expect(response.statusCode).toBe(403);
  });
});
