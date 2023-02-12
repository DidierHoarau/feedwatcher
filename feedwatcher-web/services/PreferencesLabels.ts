import * as _ from "lodash";

const PREFERENCES_LABELS_DISPLAY = "preferences_labels_display";

export class PreferencesLabels {
  //
  public static isCollapsed(label: string): boolean {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_LABELS_DISPLAY) as string) || [];
    return (_.find(preferences, { label }) || { label, isCollapsed: false }).isCollapsed;
  }

  public static toggleCollapsed(label: string): void {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_LABELS_DISPLAY) as string) || [];
    let labelPreferences = _.find(preferences, { label });
    if (!labelPreferences) {
      labelPreferences = { label, isCollapsed: false };
      preferences.push(labelPreferences);
    }
    labelPreferences.isCollapsed = !labelPreferences.isCollapsed;
    localStorage.setItem(PREFERENCES_LABELS_DISPLAY, JSON.stringify(preferences));
  }
}
