import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import sanitizeHtml from "sanitize-html";
import { UrlSafetyError, UrlSafetyFetchText } from "../utils-std-ts/UrlSafety";

const SANITIZE_OPTIONS = {
  allowedTags: [
    "a",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "img",
    "figure",
    "figcaption",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "br",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https"],
};

// Extracts readable article content from a web page: SSRF-protected fetch,
// Readability extraction, then HTML sanitization so only safe text/image
// markup survives.
export async function ItemReaderExtract(
  urlRaw: string,
): Promise<{ title: string; content: string }> {
  const url = String(urlRaw);
  const html = await UrlSafetyFetchText(url);
  try {
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    dom.window.close();
    const content = article?.content
      ? sanitizeHtml(String(article.content), SANITIZE_OPTIONS)
      : "";
    if (!content.trim()) {
      throw new UrlSafetyError("Unable to extract article content", 422);
    }
    return { title: String(article.title || ""), content };
  } catch (err) {
    if (err instanceof UrlSafetyError) {
      throw err;
    }
    throw new UrlSafetyError("Unable to extract article content", 422);
  }
}
