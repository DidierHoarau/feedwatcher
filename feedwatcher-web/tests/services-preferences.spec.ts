import { beforeEach, describe, expect, test } from "vitest";
import { PreferencesService } from "~~/services/PreferencesService";

describe("PreferencesService interface size", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-scale");
  });

  test("defaults to automatic and leaves the document untouched", () => {
    expect(PreferencesService.getUiScale()).toBe("auto");

    PreferencesService.applyUiScale();

    expect(document.documentElement.hasAttribute("data-ui-scale")).toBe(false);
  });

  test("persists the chosen scale and applies it to the document", () => {
    PreferencesService.setUiScale("compact");

    expect(localStorage.getItem("ui_scale")).toBe("compact");
    expect(document.documentElement.getAttribute("data-ui-scale")).toBe(
      "compact",
    );
  });

  test("falls back to automatic for unknown stored values", () => {
    localStorage.setItem("ui_scale", "huge");

    expect(PreferencesService.getUiScale()).toBe("auto");

    PreferencesService.setUiScale("huge");

    expect(localStorage.getItem("ui_scale")).toBe("auto");
    expect(document.documentElement.hasAttribute("data-ui-scale")).toBe(false);
  });
});
