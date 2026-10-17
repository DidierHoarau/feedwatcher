import {
  DEFAULT_USER_SETTINGS,
  UserSettingsFromJson,
  UserSettingsToJson,
} from "./UserSettings";

describe("UserSettings", () => {
  //
  test("returns the defaults for null, undefined and garbage input (N1)", () => {
    expect(UserSettingsFromJson(null)).toEqual(DEFAULT_USER_SETTINGS);
    expect(UserSettingsFromJson(undefined)).toEqual(DEFAULT_USER_SETTINGS);
    expect(UserSettingsFromJson("garbage")).toEqual(DEFAULT_USER_SETTINGS);
    expect(UserSettingsFromJson(42)).toEqual(DEFAULT_USER_SETTINGS);
  });

  test("returns the defaults for an empty object (N1)", () => {
    expect(UserSettingsFromJson({})).toEqual(DEFAULT_USER_SETTINGS);
  });

  test("parses a valid settings object (N1)", () => {
    const settings = UserSettingsFromJson({
      notifications: {
        digest: true,
        newItems: "labels",
        newItemsLabels: ["news", "tech"],
      },
      summaryPrompt: "Summarize like a pirate",
    });
    expect(settings).toEqual({
      notifications: {
        digest: true,
        newItems: "labels",
        newItemsLabels: ["news", "tech"],
      },
      summaryPrompt: "Summarize like a pirate",
    });
  });

  test("rejects an unknown newItems mode (N1)", () => {
    expect(
      UserSettingsFromJson({ notifications: { newItems: "sometimes" } })
    ).toEqual(DEFAULT_USER_SETTINGS);
  });

  test("ignores non-boolean digest values (N1)", () => {
    const settings = UserSettingsFromJson({ notifications: { digest: "yes" } });
    expect(settings.notifications.digest).toBe(false);
  });

  test("drops malformed labels and dedupes (N1)", () => {
    const settings = UserSettingsFromJson({
      notifications: {
        newItems: "labels",
        newItemsLabels: ["ok", "", "   ", 42, null, "ok", "news"],
      },
    });
    expect(settings.notifications.newItemsLabels).toEqual(["ok", "news"]);
  });

  test("caps the summary prompt to 5000 chars (N1)", () => {
    const settings = UserSettingsFromJson({
      summaryPrompt: "a".repeat(6000),
    });
    expect(settings.summaryPrompt.length).toBe(5000);
  });

  test("caps the label list to 50 entries (N1)", () => {
    const labels = [];
    for (let i = 0; i < 80; i++) {
      labels.push(`label-${i}`);
    }
    const settings = UserSettingsFromJson({
      notifications: { newItems: "labels", newItemsLabels: labels },
    });
    expect(settings.notifications.newItemsLabels.length).toBe(50);
  });

  test("drops labels longer than 200 chars (N1)", () => {
    const settings = UserSettingsFromJson({
      notifications: {
        newItems: "labels",
        newItemsLabels: ["a".repeat(201), "short"],
      },
    });
    expect(settings.notifications.newItemsLabels).toEqual(["short"]);
  });

  test("roundtrips through JSON (N1)", () => {
    const settings = UserSettingsFromJson({
      notifications: {
        digest: true,
        newItems: "labels",
        newItemsLabels: ["tech"],
      },
      summaryPrompt: "custom prompt",
    });
    const json = UserSettingsToJson(settings);
    expect(JSON.parse(json)).toEqual(settings);
  });
});
