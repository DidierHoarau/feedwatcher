import { SourceItem } from "./SourceItem";
import { SourceItemStatus } from "./SourceItemStatus";

describe("SourceItem", () => {
  //
  test("should create a new source item with UUID", () => {
    const item = new SourceItem();
    expect(item.id).toBeDefined();
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.info).toBeUndefined();
  });

  test("should set all properties", () => {
    const item = new SourceItem();
    item.sourceId = "src-1";
    item.sourceName = "CNN";
    item.title = "Breaking News";
    item.content = "<p>Some content</p>";
    item.url = "https://cnn.com/article1";
    item.thumbnail = "https://cnn.com/thumb.jpg";
    item.status = SourceItemStatus.unread;
    item.datePublished = new Date("2025-01-15T10:00:00Z");
    item.info = { author: "John" };

    expect(item.sourceId).toBe("src-1");
    expect(item.sourceName).toBe("CNN");
    expect(item.title).toBe("Breaking News");
    expect(item.content).toBe("<p>Some content</p>");
    expect(item.url).toBe("https://cnn.com/article1");
    expect(item.thumbnail).toBe("https://cnn.com/thumb.jpg");
    expect(item.status).toBe(SourceItemStatus.unread);
    expect(item.datePublished).toEqual(new Date("2025-01-15T10:00:00Z"));
    expect(item.info).toEqual({ author: "John" });
  });

  test("fromRaw should parse a raw database row correctly", () => {
    const raw = {
      id: "item-1",
      sourceId: "src-1",
      sourceName: "BBC",
      title: "World News Today",
      content: "<p>Content here</p>",
      url: "https://bbc.com/world",
      status: "read",
      datePublished: "2025-02-01T12:00:00.000Z",
      info: '{"language":"en"}',
      thumbnail: "https://bbc.com/thumb.png",
    };

    const item = SourceItem.fromRaw(raw);
    expect(item.id).toBe("item-1");
    expect(item.sourceId).toBe("src-1");
    expect(item.sourceName).toBe("BBC");
    expect(item.title).toBe("World News Today");
    expect(item.content).toBe("<p>Content here</p>");
    expect(item.url).toBe("https://bbc.com/world");
    expect(item.status).toBe("read");
    expect(item.datePublished).toEqual(new Date("2025-02-01T12:00:00.000Z"));
    expect(item.info).toEqual({ language: "en" });
    expect(item.thumbnail).toBe("https://bbc.com/thumb.png");
  });

  test("fromRaw should handle missing sourceName and thumbnail", () => {
    const raw = {
      id: "item-2",
      sourceId: "src-2",
      title: "No extras",
      content: "text",
      url: "https://example.com",
      status: "unread",
      datePublished: "2025-03-01T00:00:00.000Z",
      info: "{}",
    };

    const item = SourceItem.fromRaw(raw);
    expect(item.id).toBe("item-2");
    expect(item.sourceName).toBeUndefined();
    expect(item.thumbnail).toBeUndefined();
  });
});
