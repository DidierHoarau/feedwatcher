import { jwtDecode } from "jwt-decode";

const AUTH_TOKEN_KEY = "auth_token";

export class AuthService {
  //
  public static async isAuthenticated(): Promise<boolean> {
    if (await AuthService.getToken()) {
      return true;
    } else {
      return false;
    }
  }

  public static async saveToken(token: string): Promise<void> {
    const previousToken = localStorage.getItem(AUTH_TOKEN_KEY);
    await localStorage.setItem(AUTH_TOKEN_KEY, token);
    if (previousToken !== token) {
      await AuthService.clearApiCache();
    }
  }

  public static async removeToken(): Promise<void> {
    await localStorage.removeItem(AUTH_TOKEN_KEY);
    await AuthService.clearApiCache();
  }

  // Purge cached API responses so that after a logout/login change the next
  // user on a shared browser never sees the previous user's data.
  public static async clearApiCache(): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      navigator.serviceWorker?.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "FW_CLEAR_API_CACHE",
      });
    }
    if (typeof caches !== "undefined") {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter(
              (name) => name.startsWith("fw-") && name.includes("dynamic"),
            )
            .map((name) => caches.delete(name)),
        );
      } catch {
        // CacheStorage unavailable: nothing to clear.
      }
    }
  }

  public static async getToken() {
    const storedKey = localStorage.getItem(AUTH_TOKEN_KEY);
    if (storedKey) {
      const decoded = jwtDecode(storedKey);
      if ((decoded as any).exp < Date.now() / 1000) {
        console.log("Auth token expired");
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return null;
      }
      return storedKey;
    } else {
      return null;
    }
  }

  public static async getAuthHeader(): Promise<any> {
    try {
      const token = await AuthService.getToken();
      if (token) {
        return {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
      } else {
        return {};
      }
    } catch {
      return {};
    }
  }
}
