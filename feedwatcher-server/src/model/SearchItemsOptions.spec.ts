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

  test("should default with no beforeDate", () => {
    const options = new SearchItemsOptions();
    expect(options.beforeDate).toBeUndefined();
  });

  test("should accept a beforeDate", () => {
    const options = new SearchItemsOptions();
    const date = new Date("2024-01-15T10:00:00Z");
    options.beforeDate = date;
    expect(options.beforeDate).toBe(date);
  });
});
