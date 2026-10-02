import * as jwt from "jsonwebtoken";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { User } from "../model/User";
import { UserSession } from "../model/UserSession";
import { Config } from "../Config";
import { Span } from "@opentelemetry/sdk-trace-base";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsWithLock,
} from "@devopsplaybook.io/common-utils";
import { OTelLogger, OTelTracer } from "../OTelContext";

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

export async function AuthGenerateJWT(user: User): Promise<string> {
  return jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + config.JWT_VALIDITY_DURATION,
      userId: user.id,
      userName: user.name,
    },
    config.JWT_KEY,
  );
}

export async function AuthGetUserSession(req: any): Promise<UserSession> {
  const userSession: UserSession = { isAuthenticated: false };
  if (req.headers.authorization) {
    try {
      const info = jwt.verify(
        req.headers.authorization.split(" ")[1],
        config.JWT_KEY,
      );
      userSession.userId = info.userId;
      userSession.isAuthenticated = true;
    } catch (err) {
      // Expired/invalid tokens are a normal condition, not a server error
      logger.warn(`Invalid user session token: ${err.message}`);
    }
  }
  return userSession;
}
