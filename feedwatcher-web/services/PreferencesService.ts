const AUTO_MARK_READ_KEY = "auto_mark_read_on_scroll";
const OPEN_DETAILS_MODE_KEY = "open_details_mode";
const OPEN_LINKS_MODE_KEY = "open_links_mode";
const PODCAST_PLAYBACK_RATE_KEY = "podcast_playback_rate";
const UI_SCALE_KEY = "ui_scale";

export const PODCAST_PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const UI_SCALES = ["auto", "compact", "standard", "large"];

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

  // Podcast playback speed — per-browser preference, applied to the shared
  // Audio element so it also holds in the mini player.
  getPodcastPlaybackRate(): number {
    const stored = Number(localStorage.getItem(PODCAST_PLAYBACK_RATE_KEY));
    return PODCAST_PLAYBACK_SPEEDS.includes(stored) ? stored : 1;
  },

  setPodcastPlaybackRate(rate: number): void {
    localStorage.setItem(PODCAST_PLAYBACK_RATE_KEY, String(rate));
  },

  // Interface size — scales the whole UI; "auto" keeps the default, which is
  // slightly smaller on phones (see --ui-scale in variables.css).
  getUiScale(): string {
    const stored = localStorage.getItem(UI_SCALE_KEY) || "auto";
    return UI_SCALES.includes(stored) ? stored : "auto";
  },

  setUiScale(scale: string): void {
    const value = UI_SCALES.includes(scale) ? scale : "auto";
    localStorage.setItem(UI_SCALE_KEY, value);
    this.applyUiScale();
  },

  applyUiScale(): void {
    const scale = this.getUiScale();
    if (scale === "auto") {
      document.documentElement.removeAttribute("data-ui-scale");
      return;
    }
    document.documentElement.setAttribute("data-ui-scale", scale);
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
