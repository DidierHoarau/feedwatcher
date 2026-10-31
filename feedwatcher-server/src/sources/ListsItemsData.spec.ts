import { Span } from "@opentelemetry/sdk-trace";
import { ListsItemsDataGetItemForUser } from "./ListsItemsData";
import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";

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
  DbUtilsQuerySQL: jest.fn(),
}));

const span = {} as Span;

describe("ListsItemsDataGetItemForUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("scopes the item lookup to sources owned by the caller (cross-tenant)", async () => {
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);

    await ListsItemsDataGetItemForUser(span, "item-of-user-2", "user-1");

    const [_calledSpan, sql, params] = jest.mocked(DbUtilsQuerySQL).mock.calls[0];
    expect(sql).toContain("FROM sources_items, lists_items, sources");
    expect(sql).toContain("sources.id = sources_items.sourceId");
    expect(sql).toContain("sources.userId = ?");
    expect(params).toEqual([
      "item-of-user-2",
      "item-of-user-2",
      "user-1",
      "user-1",
    ]);
  });

  test("returns null when the item is not in the caller's list", async () => {
    jest.mocked(DbUtilsQuerySQL).mockResolvedValue([]);

    await expect(
      ListsItemsDataGetItemForUser(span, "item-1", "user-1")
    ).resolves.toBeNull();
  });
});
