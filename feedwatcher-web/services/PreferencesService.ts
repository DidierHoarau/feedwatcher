const AUTO_MARK_READ_KEY = "auto_mark_read_on_scroll";

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
