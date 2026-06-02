import { Rules } from "./Rules";

describe("Rules", () => {
  //
  test("should create a new rules instance with UUID and empty info", () => {
    const rules = new Rules();
    expect(rules.id).toBeDefined();
    expect(rules.id.length).toBeGreaterThan(0);
    expect(rules.info).toEqual([]);
    expect(rules.userId).toBeUndefined();
  });

  test("should set properties correctly", () => {
    const rules = new Rules();
    rules.userId = "user-99";
    rules.info = [
      {
        labelName: "tech",
        autoRead: [{ pattern: "javascript", ageDays: 7 }],
      },
    ];
    expect(rules.userId).toBe("user-99");
    expect(rules.info).toHaveLength(1);
    expect(rules.info[0].labelName).toBe("tech");
  });

  test("toJson should return expected shape", () => {
    const rules = new Rules();
    rules.userId = "u1";
    rules.info = [
      {
        isRoot: true,
        autoDelete: [{ pattern: "spam", ageDays: 1 }],
      },
    ];
    const json = rules.toJson();
    expect(json).toEqual({
      id: rules.id,
      userId: "u1",
      info: [{ isRoot: true, autoDelete: [{ pattern: "spam", ageDays: 1 }] }],
    });
  });

  test("fromJson should return null for null input", () => {
    expect(Rules.fromJson(null)).toBeNull();
  });

  test("fromJson should return null for undefined input", () => {
    expect(Rules.fromJson(undefined)).toBeNull();
  });

  test("fromJson should parse full JSON correctly", () => {
    const rules = Rules.fromJson({
      id: "rules-1",
      userId: "u2",
      info: [
        {
          labelName: "news",
          autoRead: [{ pattern: "breaking", ageDays: 3 }],
          autoDelete: [{ pattern: "old", ageDays: 30 }],
        },
      ],
    });
    expect(rules.id).toBe("rules-1");
    expect(rules.userId).toBe("u2");
    expect(rules.info).toHaveLength(1);
    expect(rules.info[0].labelName).toBe("news");
    expect(rules.info[0].autoRead).toHaveLength(1);
    expect(rules.info[0].autoRead[0].pattern).toBe("breaking");
    expect(rules.info[0].autoDelete[0].ageDays).toBe(30);
  });

  test("fromJson should generate id if not provided", () => {
    const rules = Rules.fromJson({
      userId: "u3",
      info: [],
    });
    expect(rules.id).toBeDefined();
    expect(rules.userId).toBe("u3");
  });

  test("fromJson should parse info from JSON string", () => {
    const rules = Rules.fromJson({
      id: "r2",
      userId: "u4",
      info: '[{"isRoot":true,"autoRead":[]}]',
    });
    expect(rules.info).toHaveLength(1);
    expect(rules.info[0].isRoot).toBe(true);
  });

  test("fromJson should use info as-is when it's already an object", () => {
    const rules = Rules.fromJson({
      id: "r3",
      userId: "u5",
      info: [{ isRoot: false }],
    });
    expect(rules.info).toHaveLength(1);
    expect(rules.info[0].isRoot).toBe(false);
  });
});
