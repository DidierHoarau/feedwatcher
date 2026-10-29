import { describe, expect, test } from "vitest";
import {
  applyTreeVisibility,
  assignTreeCounts,
  buildSourceTree,
  filterTreeIndices,
} from "~~/services/SourceTree";

function build(inputs: any[], collapsed: string[] = []) {
  return buildSourceTree(inputs, (labelName) => collapsed.includes(labelName));
}

function summary(rows: any[]) {
  return rows.map((row) => `${"  ".repeat(row.depth)}${row.displayName}`);
}

describe("buildSourceTree", () => {
  test("orders rows as root, labels with their sources, then nested labels", () => {
    const rows = build([
      { sourceId: "s1", sourceName: "Autoblog", labelName: "cars" },
      { sourceId: "s2", sourceName: "One", labelName: "" },
      { sourceId: "s3", sourceName: "Tech", labelName: "cars/makes" },
      { sourceId: "s4", sourceName: "Zeta", labelName: "news" },
    ]);

    expect(summary(rows)).toEqual([
      "All",
      "  One",
      "  cars",
      "    Autoblog",
      "    makes",
      "      Tech",
      "  news",
      "    Zeta",
    ]);
  });

  test("depth is the real hierarchy depth for labels and sources alike", () => {
    const rows = build([
      { sourceId: "s1", sourceName: "One", labelName: "" },
      { sourceId: "s2", sourceName: "Two", labelName: "news" },
      { sourceId: "s3", sourceName: "Three", labelName: "news/tech" },
    ]);

    expect(rows.map((row) => [row.displayName, row.depth])).toEqual([
      ["All", 0],
      ["One", 1],
      ["news", 1],
      ["Two", 2],
      ["tech", 2],
      ["Three", 3],
    ]);
  });

  test("emits every ancestor label even when only a deep label has sources", () => {
    const rows = build([
      { sourceId: "s1", sourceName: "Deep", labelName: "a/b/c" },
    ]);

    expect(summary(rows)).toEqual([
      "All",
      "  a",
      "    b",
      "      c",
      "        Deep",
    ]);
  });

  test("a collapsed label hides its subtree, not its siblings", () => {
    const rows = build(
      [
        { sourceId: "s1", sourceName: "News", labelName: "news" },
        { sourceId: "s2", sourceName: "Tech", labelName: "news/tech" },
        { sourceId: "s3", sourceName: "Paper", labelName: "newspaper" },
      ],
      ["news"],
    );

    const visible = rows
      .filter((row) => row.isVisible)
      .map((row) => row.displayName);
    expect(visible).toEqual(["All", "news", "newspaper", "Paper"]);
  });

  test("a source at a label's depth is not treated as its child", () => {
    // "newspaper" shares the "news" prefix but is a different top-level label.
    const rows = build([
      { sourceId: "s1", sourceName: "News", labelName: "news" },
      { sourceId: "s2", sourceName: "Paper", labelName: "newspaper" },
    ]);

    expect(rows.map((row) => [row.displayName, row.depth])).toEqual([
      ["All", 0],
      ["news", 1],
      ["News", 2],
      ["newspaper", 1],
      ["Paper", 2],
    ]);
  });
});

describe("applyTreeVisibility", () => {
  test("recomputing after expanding a label shows the subtree again", () => {
    const rows = build(
      [
        { sourceId: "s1", sourceName: "News", labelName: "news" },
        { sourceId: "s2", sourceName: "Tech", labelName: "news/tech" },
      ],
      ["news"],
    );
    expect(rows.filter((row) => row.isVisible)).toHaveLength(2);

    rows.find((row) => row.labelName === "news")!.isCollapsed = false;
    applyTreeVisibility(rows);

    expect(rows.filter((row) => row.isVisible)).toHaveLength(5);
  });

  test("nested collapsed labels stay collapsed for their own subtree", () => {
    const rows = build(
      [
        { sourceId: "s1", sourceName: "News", labelName: "news" },
        { sourceId: "s2", sourceName: "Tech", labelName: "news/tech" },
        { sourceId: "s3", sourceName: "Deep", labelName: "news/tech/deep" },
      ],
      ["news/tech"],
    );

    expect(
      rows.filter((row) => row.isVisible).map((row) => row.displayName),
    ).toEqual(["All", "news", "News", "tech"]);
  });
});

describe("assignTreeCounts", () => {
  test("aggregates a label over its whole subtree, never over prefix shares", () => {
    const rows = build([
      { sourceId: "s1", sourceName: "News", labelName: "news" },
      { sourceId: "s2", sourceName: "Tech", labelName: "news/tech" },
      { sourceId: "s3", sourceName: "Paper", labelName: "newspaper" },
    ]);
    assignTreeCounts(
      rows,
      [
        { sourceId: "s1", unreadCount: 5 },
        { sourceId: "s2", unreadCount: 2 },
        { sourceId: "s3", unreadCount: 9 },
      ],
      "unreadCount",
    );

    const counts = Object.fromEntries(
      rows
        .filter((row) => row.isLabel)
        .map((row) => [row.labelName || "root", row.unreadCount]),
    );
    expect(counts).toEqual({
      root: 16,
      news: 7,
      "news/tech": 2,
      newspaper: 9,
    });
  });

  test("recomputing replaces instead of accumulating and defaults to zero", () => {
    const rows = build([
      { sourceId: "s1", sourceName: "News", labelName: "news" },
      { sourceId: "s2", sourceName: "Tech", labelName: "news/tech" },
    ]);
    assignTreeCounts(rows, [{ sourceId: "s1", unreadCount: 5 }], "unreadCount");
    assignTreeCounts(rows, [{ sourceId: "s1", unreadCount: 4 }], "unreadCount");

    const label = rows.find((row) => row.labelName === "news") as any;
    const tech = rows.find((row) => row.labelName === "news/tech") as any;
    const source = rows.find((row) => row.sourceId === "s2") as any;
    expect(label.unreadCount).toBe(4);
    expect(tech.unreadCount).toBe(0);
    expect(source.unreadCount).toBe(0);
  });
});

describe("filterTreeIndices", () => {
  const rows = build([
    { sourceId: "s1", sourceName: "Autoblog", labelName: "cars" },
    { sourceId: "s2", sourceName: "Tech Weekly", labelName: "cars/makes" },
    { sourceId: "s3", sourceName: "Paper", labelName: "news" },
  ]);

  test("without a query returns the rows the collapsed tree shows", () => {
    expect(filterTreeIndices(rows, "  ")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("matches sources by name and keeps their ancestor labels", () => {
    const indices = filterTreeIndices(rows, "tech weekly");
    expect(indices.map((index) => rows[index].displayName)).toEqual([
      "All",
      "cars",
      "makes",
      "Tech Weekly",
    ]);
  });

  test("matches sources by label path", () => {
    const indices = filterTreeIndices(rows, "cars/");
    expect(indices.map((index) => rows[index].displayName)).toEqual([
      "All",
      "cars",
      "Autoblog",
      "makes",
      "Tech Weekly",
    ]);
  });

  test("matches a label on its own name", () => {
    const indices = filterTreeIndices(rows, "new");
    expect(indices.map((index) => rows[index].displayName)).toEqual([
      "All",
      "news",
      "Paper",
    ]);
  });

  test("returns nothing when no row matches", () => {
    expect(filterTreeIndices(rows, "zzz")).toEqual([]);
  });
});
