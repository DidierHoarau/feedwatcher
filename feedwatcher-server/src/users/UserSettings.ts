export interface UserNotificationSettings {
  digest: boolean;
  newItems: "off" | "all" | "labels";
  newItemsLabels: string[];
}

export interface UserSettings {
  notifications: UserNotificationSettings;
  summaryPrompt: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: {
    digest: false,
    newItems: "off",
    newItemsLabels: [],
  },
  summaryPrompt: "",
};

const SUMMARY_PROMPT_MAX_CHARS = 5000;
const LABELS_MAX_COUNT = 50;
const LABEL_MAX_CHARS = 200;

function normalizeLabel(label: any): string | null {
  if (typeof label !== "string") {
    return null;
  }
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > LABEL_MAX_CHARS) {
    return null;
  }
  return trimmed;
}

// Merges arbitrary input over the defaults; anything missing, malformed or
// out of bounds silently falls back to its default value.
export function UserSettingsFromJson(json: any): UserSettings {
  const settings: UserSettings = {
    notifications: { ...DEFAULT_USER_SETTINGS.notifications },
    summaryPrompt: DEFAULT_USER_SETTINGS.summaryPrompt,
  };
  if (!json || typeof json !== "object") {
    return settings;
  }
  const notifications = json.notifications;
  if (notifications && typeof notifications === "object") {
    if (typeof notifications.digest === "boolean") {
      settings.notifications.digest = notifications.digest;
    }
    if (
      notifications.newItems === "off" ||
      notifications.newItems === "all" ||
      notifications.newItems === "labels"
    ) {
      settings.notifications.newItems = notifications.newItems;
    }
    if (Array.isArray(notifications.newItemsLabels)) {
      const labels: string[] = [];
      for (const label of notifications.newItemsLabels) {
        const normalized = normalizeLabel(label);
        if (normalized !== null && !labels.includes(normalized)) {
          labels.push(normalized);
        }
        if (labels.length >= LABELS_MAX_COUNT) {
          break;
        }
      }
      settings.notifications.newItemsLabels = labels;
    }
  }
  if (typeof json.summaryPrompt === "string") {
    settings.summaryPrompt = json.summaryPrompt.substring(
      0,
      SUMMARY_PROMPT_MAX_CHARS,
    );
  }
  return settings;
}

export function UserSettingsToJson(settings: UserSettings): string {
  return JSON.stringify(settings);
}
