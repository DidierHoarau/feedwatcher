import Fastify, { FastifyInstance } from "fastify";
import axios from "axios";
import * as dns from "dns";
import { ItemsRoutes } from "./ItemsRoutes";
import { AuthGetUserSession } from "../users/Auth";
import { SearchItemsDataListForUser } from "./SearchItemsData";
import { SourceItemsDataUpdateMultipleStatusForUser } from "./SourceItemsData";

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

jest.mock("./SearchItemsData", () => ({
  SearchItemsDataListForUser: jest.fn(),
  SearchItemsDataListForSource: jest.fn(),
  SearchItemsDataListItemsForLabel: jest.fn(),
}));

jest.mock("./SourcesData", () => ({
  SourcesDataGet: jest.fn(),
}));

jest.mock("./SourceItemsData", () => ({
  SourceItemsDataGetForUser: jest.fn(),
  SourceItemsDataUpdateMultipleStatusForUser: jest.fn(),
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

describe("ItemsRoutes fetch-url", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    fastify = Fastify();
    await new ItemsRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("rejects a loopback target with 400 (H2)", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "http://127.0.0.1:8080/secret" },
    });
    expect(response.statusCode).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a private-range target with 400 (H2)", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "http://10.1.2.3/internal" },
    });
    expect(response.statusCode).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a redirect to a private target (H2)", async () => {
    jest.mocked(axios.get).mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
      data: "",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/redirect" },
    });
    expect(response.statusCode).toBe(400);
  });

  test("returns the body of an allowed page", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: "<html>hello</html>",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/page" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ content: "<html>hello</html>" });
  });

  test("rejects a disallowed content type with 415 (H2)", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      data: "binary",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/file.bin" },
    });
    expect(response.statusCode).toBe(415);
  });

  test("maps an oversized response to 413 (H2)", async () => {
    const sizeError: any = new Error("maxContentLength size exceeded");
    sizeError.code = "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED";
    jest.mocked(axios.get).mockRejectedValue(sizeError);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/huge" },
    });
    expect(response.statusCode).toBe(413);
  });

  test("returns 400 for a missing url", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com" },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("ItemsRoutes request validation (M1)", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    fastify = Fastify();
    await new ItemsRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("rejects a status update without itemIds with 400", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/status",
      payload: { status: "read" },
    });
    expect(response.statusCode).toBe(400);
    expect(SourceItemsDataUpdateMultipleStatusForUser).not.toHaveBeenCalled();
  });

  test("rejects a status update with an empty itemIds array with 400", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/status",
      payload: { status: "read", itemIds: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(SourceItemsDataUpdateMultipleStatusForUser).not.toHaveBeenCalled();
  });

  test("rejects an unknown status value with 400", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/status",
      payload: { status: "archived", itemIds: ["item-1"] },
    });
    expect(response.statusCode).toBe(400);
    expect(SourceItemsDataUpdateMultipleStatusForUser).not.toHaveBeenCalled();
  });

  test("accepts a valid status update", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/status",
      payload: { status: "read", itemIds: ["item-1"] },
    });
    expect(response.statusCode).toBe(200);
    expect(SourceItemsDataUpdateMultipleStatusForUser).toHaveBeenCalledWith(
      expect.anything(),
      ["item-1"],
      "read",
      "user-1"
    );
  });

  test("rejects an invalid sinceDate with 400 instead of a range error", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/search",
      payload: { searchCriteria: "all", sinceDate: "not-a-date" },
    });
    expect(response.statusCode).toBe(400);
    expect(SearchItemsDataListForUser).not.toHaveBeenCalled();
  });

  test("rejects an unknown searchCriteria with 400", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/search",
      payload: { searchCriteria: "bogus" },
    });
    expect(response.statusCode).toBe(400);
    expect(SearchItemsDataListForUser).not.toHaveBeenCalled();
  });

  test("rejects a malformed cursor with 400", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/search",
      payload: {
        searchCriteria: "all",
        cursor: { datePublished: "yesterday", id: "" },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(SearchItemsDataListForUser).not.toHaveBeenCalled();
  });

  test("accepts a valid search with an ISO cursor", async () => {
    jest.mocked(SearchItemsDataListForUser).mockResolvedValue({
      sourceItems: [],
      pageHasMore: false,
      nextCursor: null,
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/search",
      payload: {
        searchCriteria: "all",
        filterStatus: "all",
        cursor: {
          datePublished: "2026-10-01T12:00:00.000Z",
          id: "item-011",
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const call = jest.mocked(SearchItemsDataListForUser).mock.calls[0];
    expect(call[2].cursor).toEqual({
      datePublished: "2026-10-01T12:00:00.000Z",
      id: "item-011",
    });
  });
});
