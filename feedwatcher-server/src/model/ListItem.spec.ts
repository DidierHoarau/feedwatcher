import { ListItem } from "./ListItem";

describe("ListItem", () => {
  //
  test("should create a new list item with UUID and default name", () => {
    const item = new ListItem();
    expect(item.id).toBeDefined();
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.name).toBe("_default");
    expect(item.info).toEqual({});
    expect(item.itemId).toBeUndefined();
    expect(item.userId).toBeUndefined();
  });

  test("should set properties correctly", () => {
    const item = new ListItem();
    item.itemId = "source-item-1";
    item.userId = "user-1";
    item.name = "favorites";
    item.info = { note: "saved for later" };

    expect(item.itemId).toBe("source-item-1");
    expect(item.userId).toBe("user-1");
    expect(item.name).toBe("favorites");
    expect(item.info).toEqual({ note: "saved for later" });
  });

  test("should allow overriding default name", () => {
    const item = new ListItem();
    item.name = "custom-list";
    expect(item.name).toBe("custom-list");
  });
});
