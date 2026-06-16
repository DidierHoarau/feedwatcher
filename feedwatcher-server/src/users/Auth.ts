import * as jwt from "jsonwebtoken";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { User } from "../model/User";
import { UserSession } from "../model/UserSession";
import { Config } from "../Config";
import { Span } from "@opentelemetry/sdk-trace-base";
import { DbUtilsQuerySQL } from "@devopsplaybook.io/common-utils";
import { OTelLogger, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger(path.basename(__filename));
let config: Config;

export async function AuthInit(context: Span, configIn: Config) {
  config = configIn;
  const span = OTelTracer().startSpan("AuthInit", context);
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
      await DbUtilsQuerySQL(
        span,
        "INSERT INTO metadata (type, value, dateCreated) VALUES ('auth_token', ?, ?)",
        [configIn.JWT_KEY, new Date().toISOString()],
      );
    } else if (authKeyRaw[0].value !== configIn.JWT_KEY) {
      await DbUtilsQuerySQL(
        span,
        "UPDATE metadata SET value = ? WHERE type = 'auth_token'",
        [configIn.JWT_KEY],
      );
    }
  } else if (authKeyRaw.length === 0) {
    // No config key and no DB key – generate a fresh one and persist it.
    configIn.JWT_KEY = uuidv4();
    await DbUtilsQuerySQL(
      span,
      "INSERT INTO metadata (type, value, dateCreated) VALUES ('auth_token', ?, ?)",
      [configIn.JWT_KEY, new Date().toISOString()],
    );
  } else {
    // No config key – use the one already stored in the database.
    configIn.JWT_KEY = authKeyRaw[0].value;
  }
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

export async function AuthMustBeAuthenticated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
): Promise<void> {
  let authenticated = false;
  if (req.headers.authorization) {
    try {
      jwt.verify(req.headers.authorization.split(" ")[1], config.JWT_KEY);
      authenticated = true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      authenticated = false;
    }
  }
  if (!authenticated) {
    res.status(403).send({ error: "Access Denied" });
    throw new Error("Access Denied");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      logger.error("Error Getting User Session", err);
    }
  }
  return userSession;
}
