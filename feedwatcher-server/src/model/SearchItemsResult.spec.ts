import { SearchItemsResult } from "./SearchItemsResult";
import { SourceItem } from "./SourceItem";

describe("SearchItemsResult", () => {
  //
  test("should start with empty items and no more pages", () => {
    const result = new SearchItemsResult();
    expect(result.sourceItems).toEqual([]);
    expect(result.pageHasMore).toBe(false);
    expect(result.nextCursor).toBe("");
  });

  test("should accept items", () => {
    const result = new SearchItemsResult();
    const item = new SourceItem();
    item.title = "Test Title";
    result.sourceItems.push(item);
    expect(result.sourceItems).toHaveLength(1);
    expect(result.sourceItems[0].title).toBe("Test Title");
  });

  test("should mark pageHasMore", () => {
    const result = new SearchItemsResult();
    result.pageHasMore = true;
    expect(result.pageHasMore).toBe(true);
  });

  test("should accept a nextCursor", () => {
    const result = new SearchItemsResult();
    result.nextCursor = "2024-01-15T10:00:00.000Z";
    expect(result.nextCursor).toBe("2024-01-15T10:00:00.000Z");
  });
});
