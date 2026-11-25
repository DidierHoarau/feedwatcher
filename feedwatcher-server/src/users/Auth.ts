import * as jwt from "jsonwebtoken";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { User } from "../model/User";
import { UserSession } from "../model/UserSession";
import { Config } from "../Config";
import { Span } from "@opentelemetry/sdk-trace";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsWithLock,
} from "@devopsplaybook.io/common-utils";
import { OTelLogger, OTelRequestSpan, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger(path.basename(__filename));
let config: Config;

export async function AuthInit(context: Span, configIn: Config) {
  config = configIn;
  const span = OTelTracer().startSpan("AuthInit", context);
  // Serialised across concurrently booting replicas (Postgres advisory lock).
  await DbUtilsWithLock("auth_token", async () => {
    const authKeyRaw = await DbUtilsQuerySQL(
      span,
      "SELECT * FROM metadata WHERE type='auth_token'",
    );

    // Check if a JWT_KEY was explicitly provided via config file or environment
    // variable (i.e. it is no longer the empty-string default).
    const configHasKey = configIn.JWT_KEY !== "";

    if (configHasKey) {
      // Config-provided key takes precedence. Persist it to the DB so that
      // subsequent starts without an explicit config value stay consistent.
      if (authKeyRaw.length === 0) {
        await DbUtilsExecSQL(
          span,
          "INSERT INTO metadata (type, value, dateCreated) VALUES ('auth_token', ?, ?)",
          [configIn.JWT_KEY, new Date().toISOString()],
        );
      } else if (authKeyRaw[0].value !== configIn.JWT_KEY) {
        await DbUtilsExecSQL(
          span,
          "UPDATE metadata SET value = ? WHERE type = 'auth_token'",
          [configIn.JWT_KEY],
        );
      }
    } else if (authKeyRaw.length === 0) {
      // No config key and no DB key – generate a fresh one and persist it.
      configIn.JWT_KEY = uuidv4();
      await DbUtilsExecSQL(
        span,
        "INSERT INTO metadata (type, value, dateCreated) VALUES ('auth_token', ?, ?)",
        [configIn.JWT_KEY, new Date().toISOString()],
      );
    } else {
      // No config key – use the one already stored in the database.
      configIn.JWT_KEY = authKeyRaw[0].value;
    }
  });
  span.end();
}

export async function AuthGenerateJWT(
  user: User,
  sessionStartedAt?: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const startedAt = sessionStartedAt ?? now;
  const sessionMaxDuration = AuthGetSessionMaxDuration();
  const expiresAt =
    sessionMaxDuration > 0
      ? Math.min(now + AuthGetValidityDuration(), startedAt + sessionMaxDuration)
      : now + AuthGetValidityDuration();
  return jwt.sign(
    {
      exp: expiresAt,
      sessionStartedAt: startedAt,
      userId: user.id,
      userName: user.name,
      tokenVersion: Number(user.tokenVersion) || 0,
    },
    config.JWT_KEY,
  );
}

// Fallbacks used when AuthInit receives a partial configuration (tests) or a
// deployment omits the values: the adopted 30-day / 90-day session policy.
const DEFAULT_JWT_VALIDITY_DURATION = 2592000;
const DEFAULT_JWT_SESSION_MAX_DURATION = 7776000;

export function AuthGetValidityDuration(): number {
  const value = Number(config?.JWT_VALIDITY_DURATION);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_JWT_VALIDITY_DURATION;
}

/** Absolute session lifetime in seconds; `<= 0` disables the cap. */
export function AuthGetSessionMaxDuration(): number {
  const value = Number(config?.JWT_SESSION_MAX_DURATION);
  return Number.isFinite(value) ? value : DEFAULT_JWT_SESSION_MAX_DURATION;
}

/**
 * Start of the absolute session: the explicit `sessionStartedAt` claim, with
 * `iat` as fallback for tokens issued before this claim existed.
 */
export function AuthGetSessionStart(
  info: jwt.JwtPayload,
): number | undefined {
  if (typeof info.sessionStartedAt === "number") {
    return info.sessionStartedAt;
  }
  return typeof info.iat === "number" ? info.iat : undefined;
}

/**
 * A session exceeds JWT_SESSION_MAX_DURATION since the first login: every
 * token of it is rejected so the user has to sign in again. An unknown start
 * is not considered expired.
 */
export function AuthIsSessionExpired(
  info: jwt.JwtPayload,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const sessionMaxDuration = AuthGetSessionMaxDuration();
  if (sessionMaxDuration <= 0) {
    return false;
  }
  const startedAt = AuthGetSessionStart(info);
  if (startedAt === undefined) {
    return false;
  }
  return nowSeconds >= startedAt + sessionMaxDuration;
}

/**
 * Session start of the caller's token, for re-issuing it without extending
 * the absolute session cap. Undefined when the request has no valid token.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AuthGetSessionStartedAt(req: any): number | undefined {
  if (!req.headers.authorization) {
    return undefined;
  }
  const parts = req.headers.authorization.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return undefined;
  }
  try {
    const info = jwt.verify(parts[1], config.JWT_KEY) as jwt.JwtPayload;
    return AuthGetSessionStart(info);
  } catch {
    return undefined;
  }
}

export async function AuthGetUserSession(req: any): Promise<UserSession> {
  const userSession: UserSession = { isAuthenticated: false };
  if (req.headers.authorization) {
    let info: any;
    try {
      info = jwt.verify(
        req.headers.authorization.split(" ")[1],
        config.JWT_KEY,
      );
    } catch (err) {
      // Expired/invalid tokens are a normal condition, not a server error
      logger.warn(`Invalid user session token: ${err.message}`);
      return userSession;
    }
    if (AuthIsSessionExpired(info as jwt.JwtPayload)) {
      logger.warn(
        `Session exceeded its absolute lifetime for user: ${info.userName}`,
      );
      return userSession;
    }
    // A password change bumps users.tokenVersion: tokens carrying an older
    // version are rejected even though their signature is still valid.
    const span = OTelTracer().startSpan(
      "AuthCheckTokenVersion",
      OTelRequestSpan(req),
    );
    try {
      const usersRaw = await DbUtilsQuerySQL(
        span,
        "SELECT tokenVersion FROM users WHERE id = ?",
        [info.userId],
      );
      if (usersRaw.length === 0) {
        logger.warn(`Rejected session token of unknown user ${info.userId}`);
        return userSession;
      }
      const storedVersion =
        Number(usersRaw[0].tokenVersion ?? usersRaw[0].tokenversion ?? 0) || 0;
      if (storedVersion !== (Number(info.tokenVersion ?? 0) || 0)) {
        logger.warn(
          `Rejected session token with stale version for user ${info.userId}`,
        );
        return userSession;
      }
    } finally {
      span.end();
    }
    userSession.userId = info.userId;
    userSession.isAuthenticated = true;
  }
  return userSession;
}
