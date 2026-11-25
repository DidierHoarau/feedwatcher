import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";

// Sliding session: renew once 80% of the token lifetime is spent, so a user
// keeping the app open (or reopening it) never falls back to the login form
// while the absolute server-side session cap allows it.
export const SESSION_RENEWAL_RATIO = 0.2;
export const SESSION_RENEWAL_MIN_DELAY_MS = 1_000;
export const SESSION_RENEWAL_MAX_DELAY_MS = 24 * 60 * 60 * 1_000;

interface SessionClaims {
  exp?: number;
  iat?: number;
}

function decodeClaims(token: string): SessionClaims | null {
  try {
    const decoded = jwtDecode(token) as SessionClaims;
    return typeof decoded?.exp === "number" ? decoded : null;
  } catch {
    return null;
  }
}

/** Renewal is due when 20% or less of the token lifetime remains. */
export function SessionRenewalIsDue(
  claims: SessionClaims,
  nowMs: number,
): boolean {
  if (typeof claims?.exp !== "number" || typeof claims?.iat !== "number") {
    return false;
  }
  const lifetimeMs = (claims.exp - claims.iat) * 1_000;
  if (lifetimeMs <= 0) {
    return false;
  }
  return claims.exp * 1_000 - nowMs <= lifetimeMs * SESSION_RENEWAL_RATIO;
}

/** Delay until the renewal threshold is reached, clamped to sane bounds. */
export function SessionRenewalDelayMs(
  claims: SessionClaims,
  nowMs: number,
): number {
  if (typeof claims?.exp !== "number" || typeof claims?.iat !== "number") {
    return SESSION_RENEWAL_MAX_DELAY_MS;
  }
  const lifetimeMs = (claims.exp - claims.iat) * 1_000;
  if (lifetimeMs <= 0) {
    return SESSION_RENEWAL_MIN_DELAY_MS;
  }
  const dueAtMs = claims.exp * 1_000 - lifetimeMs * SESSION_RENEWAL_RATIO;
  return Math.min(
    SESSION_RENEWAL_MAX_DELAY_MS,
    Math.max(SESSION_RENEWAL_MIN_DELAY_MS, dueAtMs - nowMs),
  );
}

/** Exchange the stored token for a fresh one through the server. */
export async function SessionRenewalRefresh(): Promise<string | null> {
  const token = await AuthService.getToken();
  if (!token) {
    return null;
  }
  const response = await axios.post(
    `${(await Config.get()).SERVER_URL}/users/session`,
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const renewedToken = response?.data?.token;
  if (typeof renewedToken !== "string" || renewedToken === "") {
    return null;
  }
  await AuthService.saveToken(renewedToken);
  return renewedToken;
}

/**
 * Renew on app start, whenever the tab becomes visible or the window is
 * focused, and when the 20% remaining threshold is reached. Returns a stop
 * function (registered on unmount).
 */
export function SessionRenewalStart(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clear = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const renewIfDue = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    const token = await AuthService.getToken();
    if (!token) {
      return;
    }
    const claims = decodeClaims(token);
    if (!claims || !SessionRenewalIsDue(claims, Date.now())) {
      return;
    }
    try {
      await SessionRenewalRefresh();
    } catch {
      // Transient failure: the next trigger (or the timer) retries.
    }
  };

  const schedule = async (): Promise<void> => {
    clear();
    if (stopped) {
      return;
    }
    const token = await AuthService.getToken();
    const claims = token ? decodeClaims(token) : null;
    const delay = claims
      ? SessionRenewalDelayMs(claims, Date.now())
      : SESSION_RENEWAL_MAX_DELAY_MS;
    timer = setTimeout(() => void tick(), delay);
  };

  const tick = async (): Promise<void> => {
    await renewIfDue();
    await schedule();
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      void tick();
    }
  };
  const onFocus = (): void => void tick();

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onFocus);
  void tick();

  return () => {
    stopped = true;
    clear();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onFocus);
  };
}
