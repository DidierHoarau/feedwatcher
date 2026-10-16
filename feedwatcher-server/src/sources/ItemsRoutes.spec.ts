import Fastify, { FastifyInstance } from "fastify";
import axios from "axios";
import * as dns from "dns";
import { ItemsRoutes } from "./ItemsRoutes";
import { AuthGetUserSession } from "../users/Auth";
import { SearchItemsDataListForUser } from "./SearchItemsData";
import { SourceItemsDataGetForUser, SourceItemsDataUpdateMultipleStatusForUser } from "./SourceItemsData";
import {
  ItemTagsDataGetForItem,
  ItemTagsDataListForUser,
  ItemTagsDataSetForItem,
} from "./ItemTagsData";

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

jest.mock("./ItemTagsData", () => ({
  ItemTagsDataGetForItem: jest.fn(),
  ItemTagsDataListForUser: jest.fn(),
  ItemTagsDataSetForItem: jest.fn(),
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

  test("returns the extracted article of an allowed page", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data:
        "<html><head><title>Fetched</title></head><body><article>" +
        "<p>hello</p></article></body></html>",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/page" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      title: "Fetched",
      content: "<p>hello</p>",
    });
  });

  test("returns 422 when no article content can be extracted", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: "<html><head><title>Empty</title></head><body></body></html>",
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/fetch-url",
      payload: { url: "https://example.com/empty" },
    });
    expect(response.statusCode).toBe(422);
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

  test("maps untilDate, sort and tagName into the search options", async () => {
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
        sinceDate: "2026-10-01T00:00:00.000Z",
        untilDate: "2026-10-02T00:00:00.000Z",
        sort: "relevance",
        tagName: "deepwork",
        pattern: "kubernetes",
      },
    });
    expect(response.statusCode).toBe(200);
    const call = jest.mocked(SearchItemsDataListForUser).mock.calls[0];
    expect(call[2].minDate).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(call[2].maxDate).toEqual(new Date("2026-10-02T00:00:00.000Z"));
    expect(call[2].sort).toBe("relevance");
    expect(call[2].tagName).toBe("deepwork");
  });

  test("forwards a relevance rank cursor to the data layer", async () => {
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
        sort: "relevance",
        cursor: {
          datePublished: "2026-10-01T12:00:00.000Z",
          id: "item-011",
          rank: -1.5,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const call = jest.mocked(SearchItemsDataListForUser).mock.calls[0];
    expect(call[2].cursor).toEqual({
      datePublished: "2026-10-01T12:00:00.000Z",
      id: "item-011",
      rank: -1.5,
    });
  });
});

describe("ItemsRoutes item tags", () => {
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

  test("GET /tags returns the user's tags", async () => {
    jest.mocked(ItemTagsDataListForUser).mockResolvedValue([
      "deepwork",
      "news",
    ]);
    const response = await fastify.inject({ method: "GET", url: "/tags" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      tags: ["deepwork", "news"],
    });
    expect(ItemTagsDataListForUser).toHaveBeenCalledWith(
      expect.anything(),
      "user-1"
    );
  });

  test("GET /tags requires authentication", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({ method: "GET", url: "/tags" });
    expect(response.statusCode).toBe(403);
    expect(ItemTagsDataListForUser).not.toHaveBeenCalled();
  });

  test("PUT /:itemId/tags saves and returns the item tags", async () => {
    jest.mocked(SourceItemsDataGetForUser).mockResolvedValue({ id: "item-1" } as any);
    jest.mocked(ItemTagsDataGetForItem).mockResolvedValue(["news"]);
    const response = await fastify.inject({
      method: "PUT",
      url: "/item-1/tags",
      payload: { tags: ["news", "  tech  ", "news", ""] },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ tags: ["news"] });
    expect(ItemTagsDataSetForItem).toHaveBeenCalledWith(
      expect.anything(),
      "item-1",
      "user-1",
      ["news", "  tech  ", "news", ""]
    );
  });

  test("PUT /:itemId/tags returns 404 for an item the user does not own", async () => {
    jest.mocked(SourceItemsDataGetForUser).mockResolvedValue(null as any);
    const response = await fastify.inject({
      method: "PUT",
      url: "/other-users-item/tags",
      payload: { tags: ["news"] },
    });
    expect(response.statusCode).toBe(404);
    expect(ItemTagsDataSetForItem).not.toHaveBeenCalled();
  });

  test("PUT /:itemId/tags rejects a body without tags", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/item-1/tags",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(ItemTagsDataSetForItem).not.toHaveBeenCalled();
  });

  test("PUT /:itemId/tags rejects more than 50 tags", async () => {
    const response = await fastify.inject({
      method: "PUT",
      url: "/item-1/tags",
      payload: { tags: Array.from({ length: 51 }, (_, i) => `tag-${i}`) },
    });
    expect(response.statusCode).toBe(400);
    expect(ItemTagsDataSetForItem).not.toHaveBeenCalled();
  });

  test("GET /:itemId/tags returns the item tags", async () => {
    jest.mocked(SourceItemsDataGetForUser).mockResolvedValue({ id: "item-1" } as any);
    jest.mocked(ItemTagsDataGetForItem).mockResolvedValue(["news"]);
    const response = await fastify.inject({
      method: "GET",
      url: "/item-1/tags",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ tags: ["news"] });
  });

  test("GET /:itemId/tags returns 404 for an unowned item", async () => {
    jest.mocked(SourceItemsDataGetForUser).mockResolvedValue(null as any);
    const response = await fastify.inject({
      method: "GET",
      url: "/item-1/tags",
    });
    expect(response.statusCode).toBe(404);
  });

  test("GET /:itemId includes the tags in the response", async () => {
    jest
      .mocked(SourceItemsDataGetForUser)
      .mockResolvedValue({ id: "item-1", tags: [] } as any);
    jest.mocked(ItemTagsDataGetForItem).mockResolvedValue(["news", "tech"]);
    const response = await fastify.inject({ method: "GET", url: "/item-1" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).tags).toEqual(["news", "tech"]);
  });

  test("PUT /:itemId/tags requires authentication", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const response = await fastify.inject({
      method: "PUT",
      url: "/item-1/tags",
      payload: { tags: ["news"] },
    });
    expect(response.statusCode).toBe(403);
    expect(ItemTagsDataSetForItem).not.toHaveBeenCalled();
  });
});
