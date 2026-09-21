const AUTO_MARK_READ_KEY = "auto_mark_read_on_scroll";
const OPEN_DETAILS_MODE_KEY = "open_details_mode";
const OPEN_LINKS_MODE_KEY = "open_links_mode";
const ITEM_ACTIONS_OVERLAY_KEY = "item_actions_overlay";

export const PreferencesService = {
  //
  isAutoMarkReadEnabled(): boolean {
    return localStorage.getItem(AUTO_MARK_READ_KEY) === "true";
  },

  toggleAutoMarkRead(): boolean {
    const current = this.isAutoMarkReadEnabled();
    const newValue = !current;
    localStorage.setItem(AUTO_MARK_READ_KEY, newValue ? "true" : "false");
    return newValue;
  },

  // Item action icons overlay — show main actions as icons on the card (mobile)
  isItemActionsOverlayEnabled(): boolean {
    return localStorage.getItem(ITEM_ACTIONS_OVERLAY_KEY) === "true";
  },

  setItemActionsOverlayEnabled(value: boolean): void {
    localStorage.setItem(ITEM_ACTIONS_OVERLAY_KEY, value ? "true" : "false");
  },

  // Open Source Details — what happens when clicking the item card
  getOpenDetailsMode(): string {
    return localStorage.getItem(OPEN_DETAILS_MODE_KEY) || "expand";
  },

  setOpenDetailsMode(mode: string): void {
    localStorage.setItem(OPEN_DETAILS_MODE_KEY, mode);
  },

  // Open Source Link — what happens when clicking the item link icon
  getOpenLinksMode(): string {
    return localStorage.getItem(OPEN_LINKS_MODE_KEY) || "dialog-summary";
  },

  setOpenLinksMode(mode: string): void {
    localStorage.setItem(OPEN_LINKS_MODE_KEY, mode);
  },

  toggleTheme(vm: any) {
    vm.isDark = !vm.isDark;
    localStorage.setItem("UI_THEME", vm.isDark ? "dark" : "light");
    this.applyTheme();
  },
  //
  applyTheme() {
    const storedTheme = localStorage.getItem("UI_THEME");
    let isDark = false;
    if (storedTheme === "dark" || storedTheme === "light") {
      isDark = storedTheme === "dark";
    } else {
      isDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light",
    );
    localStorage.setItem("UI_THEME", isDark ? "dark" : "light");
  },
};
