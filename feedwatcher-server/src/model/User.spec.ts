import { User } from "./User";
import {
  DEFAULT_USER_SETTINGS,
  UserSettingsToJson,
} from "../users/UserSettings";

describe("User", () => {
  //
  test("should create a new user with a UUID", () => {
    const user = new User();
    expect(user.id).toBeDefined();
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.name).toBeUndefined();
    expect(user.passwordEncrypted).toBeUndefined();
    expect(user.settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  test("should set properties correctly", () => {
    const user = new User();
    user.name = "testuser";
    user.passwordEncrypted = "$2b$10$encryptedhash";
    expect(user.name).toBe("testuser");
    expect(user.passwordEncrypted).toBe("$2b$10$encryptedhash");
  });

  test("toJson should return expected shape", () => {
    const user = new User();
    user.name = "jdoe";
    user.passwordEncrypted = "hash123";
    const json = user.toJson();
    expect(json).toEqual({
      id: user.id,
      name: "jdoe",
      passwordEncrypted: "hash123",
      settings: UserSettingsToJson(DEFAULT_USER_SETTINGS),
    });
  });

  test("fromJson should return null for null input", () => {
    expect(User.fromJson(null)).toBeNull();
  });

  test("fromJson should return null for undefined input", () => {
    expect(User.fromJson(undefined)).toBeNull();
  });

  test("fromJson should parse full JSON correctly", () => {
    const user = User.fromJson({
      id: "abc-123",
      name: "alice",
      passwordEncrypted: "hash_abc",
    });
    expect(user.id).toBe("abc-123");
    expect(user.name).toBe("alice");
    expect(user.passwordEncrypted).toBe("hash_abc");
    expect(user.settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  test("fromJson should parse settings JSON correctly", () => {
    const user = User.fromJson({
      id: "abc-123",
      name: "alice",
      passwordEncrypted: "hash_abc",
      settings: {
        notifications: { digest: true, newItems: "all", newItemsLabels: [] },
        summaryPrompt: "custom",
      },
    });
    expect(user.settings.notifications.digest).toBe(true);
    expect(user.settings.notifications.newItems).toBe("all");
    expect(user.settings.summaryPrompt).toBe("custom");
  });

  test("fromJson should generate id if not provided", () => {
    const user = User.fromJson({
      name: "bob",
      passwordEncrypted: "hash_bob",
    });
    expect(user.id).toBeDefined();
    expect(user.name).toBe("bob");
  });

  test("fromJson should tolerate garbage settings (N1)", () => {
    const user = User.fromJson({
      id: "abc-123",
      name: "alice",
      settings: "not-an-object",
    });
    expect(user.settings).toEqual(DEFAULT_USER_SETTINGS);
  });
});
