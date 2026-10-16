import { UrlSafetyError, UrlSafetyFetchText } from "../utils-std-ts/UrlSafety";
import { ItemReaderExtract } from "./ItemReader";

jest.mock("../utils-std-ts/UrlSafety", () => ({
  UrlSafetyError:
    jest.requireActual("../utils-std-ts/UrlSafety").UrlSafetyError,
  UrlSafetyFetchText: jest.fn(),
}));

function mockFetch(html: string): void {
  jest.mocked(UrlSafetyFetchText).mockResolvedValue(html);
}

describe("ItemReader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("extracts title, paragraphs, links and images with absolute URLs", async () => {
    mockFetch(
      "<html><head><title>My Article</title></head><body><article>" +
        "<p>Intro with a <a href=\"/deep/link\">link</a>.</p>" +
        "<img src=\"img/picture.jpg\" alt=\"pic\">" +
        "<p>Second paragraph</p>" +
        "</article></body></html>",
    );

    const result = await ItemReaderExtract("https://example.com/posts/1");

    expect(result.title).toBe("My Article");
    expect(result.content).toContain("<p>Intro with a");
    expect(result.content).toContain('href="https://example.com/deep/link"');
    expect(result.content).toContain(
      'src="https://example.com/posts/img/picture.jpg"',
    );
    expect(result.content).toContain("<p>Second paragraph</p>");
  });

  test("strips scripts, iframes, inline handlers and dangerous schemes", async () => {
    mockFetch(
      "<html><head><title>Unsafe</title></head><body><article>" +
        "<p onclick=\"steal()\">Safe text</p>" +
        "<script>alert(1)</script>" +
        "<iframe src=\"https://evil.example.com\"></iframe>" +
        "<a href=\"javascript:alert(2)\">bad link</a>" +
        "<a href=\"https://ok.example.com\">good link</a>" +
        "</article></body></html>",
    );

    const result = await ItemReaderExtract("https://example.com/page");

    expect(result.content).not.toContain("<script");
    expect(result.content).not.toContain("<iframe");
    expect(result.content).not.toContain("onclick");
    expect(result.content).not.toContain("javascript:");
    expect(result.content).toContain("Safe text");
    expect(result.content).toContain('href="https://ok.example.com/"');
  });

  test("returns 422 when no article content can be extracted", async () => {
    mockFetch("<html><head><title>Nothing</title></head><body></body></html>");

    await expect(ItemReaderExtract("https://example.com/empty")).rejects.toThrow(
      new UrlSafetyError("Unable to extract article content", 422),
    );
  });

  test("returns 422 for content that sanitizes away completely", async () => {
    mockFetch(
      "<html><head><title>Only scripts</title></head><body><article>" +
        "<script>alert(1)</script><iframe></iframe>" +
        "</article></body></html>",
    );

    await expect(ItemReaderExtract("https://example.com/scripts")).rejects.toThrow(
      new UrlSafetyError("Unable to extract article content", 422),
    );
  });

  test("propagates fetch UrlSafetyError status codes", async () => {
    jest
      .mocked(UrlSafetyFetchText)
      .mockRejectedValue(new UrlSafetyError("URL not allowed", 400));

    await expect(
      ItemReaderExtract("http://127.0.0.1/secret"),
    ).rejects.toThrow(new UrlSafetyError("URL not allowed", 400));
  });
});
