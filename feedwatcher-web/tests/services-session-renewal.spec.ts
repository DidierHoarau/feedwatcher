import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthService } from "~~/services/AuthService";
import {
  SESSION_RENEWAL_MAX_DELAY_MS,
  SESSION_RENEWAL_MIN_DELAY_MS,
  SessionRenewalDelayMs,
  SessionRenewalIsDue,
  SessionRenewalRefresh,
} from "~~/services/SessionRenewal";

const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const DAY_SECONDS = 24 * 60 * 60;

function makeToken(payload: any): string {
  const encode = (value: any) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("SessionRenewal", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test("is not due while more than 20% of the lifetime remains", () => {
    const claims = { iat: NOW_SECONDS, exp: NOW_SECONDS + 30 * DAY_SECONDS };
    expect(SessionRenewalIsDue(claims, NOW_MS)).toBe(false);
    expect(SessionRenewalIsDue(claims, NOW_MS + 24 * DAY_SECONDS * 1000)).toBe(
      true,
    );
  });

  test("ignores tokens without iat or exp", () => {
    expect(SessionRenewalIsDue({ exp: NOW_SECONDS + 100 }, NOW_MS)).toBe(false);
    expect(SessionRenewalIsDue({}, NOW_MS)).toBe(false);
  });

  test("schedules the timer at the 20% remaining threshold", () => {
    const claims = { iat: NOW_SECONDS, exp: NOW_SECONDS + 10 * 60 * 60 };
    expect(SessionRenewalDelayMs(claims, NOW_MS)).toBe(8 * 60 * 60 * 1000);
  });

  test("clamps the delay to sane bounds", () => {
    expect(SessionRenewalDelayMs({}, NOW_MS)).toBe(SESSION_RENEWAL_MAX_DELAY_MS);
    expect(
      SessionRenewalDelayMs(
        { iat: NOW_SECONDS - 100, exp: NOW_SECONDS + 1 },
        NOW_MS,
      ),
    ).toBe(SESSION_RENEWAL_MIN_DELAY_MS);
  });

  test("refreshes through POST /users/session and saves the new token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ iat: now, exp: now + 30 * DAY_SECONDS });
    const renewed = makeToken({
      iat: now,
      exp: now + 30 * DAY_SECONDS,
      refreshed: true,
    });
    await AuthService.saveToken(token);
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValueOnce({ data: { token: renewed } });

    await expect(SessionRenewalRefresh()).resolves.toBe(renewed);

    expect(post).toHaveBeenCalledWith(
      "/api/users/session",
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(await AuthService.getToken()).toBe(renewed);
  });
});
