import { SearchItemsResult } from "./SearchItemsResult";
import { SourceItem } from "./SourceItem";

describe("SearchItemsResult", () => {
  //
  test("should start with empty items and no more pages", () => {
    const result = new SearchItemsResult();
    expect(result.sourceItems).toEqual([]);
    expect(result.pageHasMore).toBe(false);
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
});
