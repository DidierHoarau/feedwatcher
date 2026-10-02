import { SearchItemsOptions } from "./SearchItemsOptions";

describe("SearchItemsOptions", () => {
  //
  test("should default with no pattern", () => {
    const options = new SearchItemsOptions();
    expect(options.pattern).toBeUndefined();
  });

  test("should accept a pattern", () => {
    const options = new SearchItemsOptions();
    options.pattern = "test pattern";
    expect(options.pattern).toBe("test pattern");
  });

  test("should accept empty pattern", () => {
    const options = new SearchItemsOptions();
    options.pattern = "";
    expect(options.pattern).toBe("");
  });

  test("should default with no cursor", () => {
    const options = new SearchItemsOptions();
    expect(options.cursor).toBeUndefined();
  });

  test("should accept a cursor", () => {
    const options = new SearchItemsOptions();
    const cursor = {
      datePublished: "2024-01-15T10:00:00.000Z",
      id: "item-1",
    };
    options.cursor = cursor;
    expect(options.cursor).toBe(cursor);
  });
});
