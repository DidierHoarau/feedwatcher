export interface KeyboardShortcut {
  keys: string;
  action: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { keys: "j / k", action: "Next / previous item" },
  { keys: "m", action: "Mark read / unread" },
  { keys: "s", action: "Save / remove bookmark" },
  { keys: "o", action: "Open the item dialog" },
  { keys: "r", action: "Open the item in reader view" },
  { keys: "v", action: "Open the external link" },
  { keys: "/", action: "Focus the filter box" },
  { keys: "?", action: "Show this help" },
  { keys: "Esc", action: "Close dialog / popover" },
];
