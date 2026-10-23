import { beforeEach, describe, expect, test } from "vitest";
import { AuthService } from "~~/services/AuthService";

const AUTH_TOKEN_KEY = "auth_token";

function makeToken(payload: any): string {
  const encode = (value: any) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("AuthService.getToken", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("a corrupted stored token is cleared and treated as logged out", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "not-a-jwt");

    await expect(AuthService.getToken()).resolves.toBeNull();

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    await expect(AuthService.getAuthHeader()).resolves.toEqual({});
  });

  test("an expired token is cleared and treated as logged out", async () => {
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      makeToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
    );

    await expect(AuthService.getToken()).resolves.toBeNull();

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  test("a token without an exp claim is cleared", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, makeToken({ userId: "user-1" }));

    await expect(AuthService.getToken()).resolves.toBeNull();

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  test("a valid token is returned and used for the auth header", async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem(AUTH_TOKEN_KEY, token);

    await expect(AuthService.getToken()).resolves.toBe(token);
    await expect(AuthService.getAuthHeader()).resolves.toEqual({
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
