import {
  LoginCodeService,
  type LoginCodeServiceOptions,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";
import { AuthService } from "./AuthService";

// No baseUrl: common-web Config defaults SERVER_URL to "/api" (the same base
// this app uses), so the service targets /api/users/login-codes.
export function LoginCodesServiceCreate(
  overrides: LoginCodeServiceOptions = {},
): LoginCodeService {
  return new LoginCodeService({
    getAuthHeader: () => AuthService.getAuthHeader(),
    onSession: (token) => AuthService.saveToken(token),
    ...overrides,
  });
}

export async function LoginCodesIsAvailable(
  service: LoginCodeService,
): Promise<boolean> {
  try {
    const capabilities = await service.capabilities();
    return capabilities.enabled === true && capabilities.available === true;
  } catch {
    return false; // routes absent (flag off) / network error -> hide the UI
  }
}
