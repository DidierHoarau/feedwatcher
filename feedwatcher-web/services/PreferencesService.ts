const AUTO_MARK_READ_KEY = "auto_mark_read_on_scroll";
const OPEN_DETAILS_MODE_KEY = "open_details_mode";
const OPEN_LINKS_MODE_KEY = "open_links_mode";
const PODCAST_PLAYBACK_RATE_KEY = "podcast_playback_rate";

export const PODCAST_PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
