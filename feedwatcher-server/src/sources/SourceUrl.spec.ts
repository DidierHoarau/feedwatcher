import { normalizeSourceUrl } from "./SourceUrl";

describe("normalizeSourceUrl", () => {
  test("lowercases the protocol and host", () => {
    expect(normalizeSourceUrl("HTTPS://EXAMPLE.COM/feed")).toBe(
      "https://example.com/feed",
    );
  });

  test("strips the trailing slash", () => {
    expect(normalizeSourceUrl("https://example.com/feed/")).toBe(
      "https://example.com/feed",
    );
  });

  test("strips the root path", () => {
    expect(normalizeSourceUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  test("keeps the query string", () => {
    expect(normalizeSourceUrl("https://example.com/feed?format=xml")).toBe(
      "https://example.com/feed?format=xml",
    );
  });

  test("trims the input", () => {
    expect(normalizeSourceUrl("  https://example.com/feed  ")).toBe(
      "https://example.com/feed",
    );
  });

  test("returns the trimmed input when the url is invalid", () => {
    expect(normalizeSourceUrl("not-a-url")).toBe("not-a-url");
  });
});
