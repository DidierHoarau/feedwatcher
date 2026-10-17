import { describe, expect, test, vi, beforeEach } from "vitest";
import { BadgeService } from "~~/services/BadgeService";

describe("BadgeService", () => {
  //
  beforeEach(() => {
    vi.clearAllMocks();
    delete (navigator as any).setAppBadge;
    delete (navigator as any).clearAppBadge;
  });

  test("is a no-op when the Badging API is absent", () => {
    expect(() => BadgeService.setUnreadCount(3)).not.toThrow();
  });

  test("calls setAppBadge with the unread count when supported", () => {
    const setAppBadge = vi.fn();
    const clearAppBadge = vi.fn();
    (navigator as any).setAppBadge = setAppBadge;
    (navigator as any).clearAppBadge = clearAppBadge;

    BadgeService.setUnreadCount(7);

    expect(setAppBadge).toHaveBeenCalledWith(7);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  test("calls clearAppBadge when the count drops to zero", () => {
    const setAppBadge = vi.fn();
    const clearAppBadge = vi.fn();
    (navigator as any).setAppBadge = setAppBadge;
    (navigator as any).clearAppBadge = clearAppBadge;

    BadgeService.setUnreadCount(0);

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  test("swallows badge errors so the UI never breaks", () => {
    (navigator as any).setAppBadge = vi.fn(() => {
      throw new Error("badge refused");
    });

    expect(() => BadgeService.setUnreadCount(2)).not.toThrow();
  });
});
