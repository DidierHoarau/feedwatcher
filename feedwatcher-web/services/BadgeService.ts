export class BadgeService {
  //
  // Badging API is feature-detected (no-op where unsupported, e.g. iOS Safari).
  public static setUnreadCount(count: number): void {
    const navigatorAny = navigator as any;
    if (typeof navigator === "undefined" || !("setAppBadge" in navigatorAny)) {
      return;
    }
    try {
      if (count > 0) {
        navigatorAny.setAppBadge(count);
      } else {
        navigatorAny.clearAppBadge();
      }
    } catch (err) {
      console.warn("App badge update failed", err);
    }
  }
}
