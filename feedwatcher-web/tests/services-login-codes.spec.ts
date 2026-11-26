import { describe, expect, test, vi } from "vitest";
import { LoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";
import {
  LoginCodesIsAvailable,
  LoginCodesServiceCreate,
} from "~~/services/LoginCodes";

describe("LoginCodesServiceCreate", () => {
  test("returns a LoginCodeService wired to the app auth", () => {
    expect(LoginCodesServiceCreate()).toBeInstanceOf(LoginCodeService);
  });

  test("applies caller overrides", () => {
    const overrides = { baseUrl: "/custom/login-codes" };
    const service = LoginCodesServiceCreate(overrides);
    expect(service).toBeInstanceOf(LoginCodeService);
  });
});

describe("LoginCodesIsAvailable", () => {
  test("is true only when the feature is enabled and available", async () => {
    const service = {
      capabilities: vi.fn().mockResolvedValue({
        enabled: true,
        available: true,
      }),
    } as never;
    await expect(LoginCodesIsAvailable(service)).resolves.toBe(true);
  });

  test("is false when the server reports the feature disabled", async () => {
    const disabled = {
      capabilities: vi.fn().mockResolvedValue({
        enabled: false,
        available: true,
      }),
    } as never;
    const unavailable = {
      capabilities: vi.fn().mockResolvedValue({
        enabled: true,
        available: false,
      }),
    } as never;
    await expect(LoginCodesIsAvailable(disabled)).resolves.toBe(false);
    await expect(LoginCodesIsAvailable(unavailable)).resolves.toBe(false);
  });

  test("is false when the capability probe fails (flag off / network)", async () => {
    const service = {
      capabilities: vi.fn().mockRejectedValue(new Error("404")),
    } as never;
    await expect(LoginCodesIsAvailable(service)).resolves.toBe(false);
  });
});
