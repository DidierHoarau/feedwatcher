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
});
