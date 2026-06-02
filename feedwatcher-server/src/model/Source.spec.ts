import { Source } from "./Source";

describe("Source", () => {
  //
  test("should create a new source with UUID and empty info", () => {
    const source = new Source();
    expect(source.id).toBeDefined();
    expect(source.id.length).toBeGreaterThan(0);
    expect(source.info).toEqual({});
    expect(source.name).toBeUndefined();
    expect(source.userId).toBeUndefined();
    expect(source.labels).toBeUndefined();
  });

  test("should set properties correctly", () => {
    const source = new Source();
    source.name = "My Feed";
    source.userId = "user-1";
    source.info = { url: "https://example.com/rss", icon: "rss" };
    source.labels = ["tech", "news"];
    expect(source.name).toBe("My Feed");
    expect(source.userId).toBe("user-1");
    expect(source.info).toEqual({
      url: "https://example.com/rss",
      icon: "rss",
    });
    expect(source.labels).toEqual(["tech", "news"]);
  });

  test("toJson should return expected shape", () => {
    const source = new Source();
    source.name = "Tech Blog";
    source.userId = "user-42";
    source.info = { url: "https://tech.blog/feed" };
    source.labels = ["tech"];
    const json = source.toJson();
    expect(json).toEqual({
      id: source.id,
      name: "Tech Blog",
      userId: "user-42",
      info: { url: "https://tech.blog/feed" },
      labels: ["tech"],
    });
  });

  test("toJson should handle missing labels", () => {
    const source = new Source();
    source.name = "No Labels";
    source.userId = "u1";
    const json = source.toJson();
    expect(json.labels).toBeUndefined();
  });
});
