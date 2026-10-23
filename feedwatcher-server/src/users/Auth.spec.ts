import { Span } from "@opentelemetry/sdk-trace-base";
import {
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
} from "@devopsplaybook.io/common-utils";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import * as fs from "fs-extra";
import * as jwt from "jsonwebtoken";
import * as os from "os";
import * as path from "path";
import { Config } from "../Config";
import { User } from "../model/User";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import { AuthGenerateJWT, AuthGetUserSession, AuthInit } from "./Auth";

const SQL_DIR = path.join(__dirname, "..", "..", "sql");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

let tempDirs: string[] = [];

function newTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-auth-"));
  tempDirs.push(dir);
  return dir;
}

function newConfig(dataDir: string, jwtKey: string): Config {
  const config = new Config();
  config.DATA_DIR = dataDir;
  config.DATABASE_TYPE = "sqlite";
  config.JWT_KEY = jwtKey;
  return config;
}

async function initDb(config: Config): Promise<Span> {
  const span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);
  return span;
}

async function storedAuthKey(span: Span): Promise<string> {
  const rows = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM metadata WHERE type='auth_token'",
  );
  return rows.length > 0 ? rows[0].value : null;
}

async function insertUser(
  span: Span,
  user: User,
  tokenVersion = 0,
): Promise<void> {
  await DbUtilsExecSQL(
    span,
    "INSERT INTO users (id,name,passwordEncrypted,tokenVersion) VALUES (?,?,?,?)",
    [user.id, user.name || "alice", user.passwordEncrypted || "hash", tokenVersion],
  );
}

afterEach(() => {
  const db = DbUtilsGetDatabase();
  if (db && typeof db.close === "function") {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

test("fresh database with no configured JWT_KEY generates and persists a key", async () => {
  const config = newConfig(newTempDir(), "");
  const span = await initDb(config);

  await expect(AuthInit(span, config)).resolves.toBeUndefined();

  expect(config.JWT_KEY).not.toBe("");
  expect(await storedAuthKey(span)).toBe(config.JWT_KEY);

  const user = new User();
  user.name = "alice";
  await insertUser(span, user);
  const token = await AuthGenerateJWT(user);
  const session = await AuthGetUserSession({
    headers: { authorization: `Bearer ${token}` },
  });
  expect(session.isAuthenticated).toBe(true);
  expect(session.userId).toBe(user.id);
});

test("fresh database with a configured JWT_KEY persists that key", async () => {
  const config = newConfig(newTempDir(), "configured-key-1234");
  const span = await initDb(config);

  await AuthInit(span, config);

  expect(config.JWT_KEY).toBe("configured-key-1234");
  expect(await storedAuthKey(span)).toBe("configured-key-1234");

  const user = new User();
  user.name = "alice";
  await insertUser(span, user);
  const token = await AuthGenerateJWT(user);
  const session = await AuthGetUserSession({
    headers: { authorization: `Bearer ${token}` },
  });
  expect(session.isAuthenticated).toBe(true);
});

test("existing database with no configured JWT_KEY reuses the stored key", async () => {
  const dataDir = newTempDir();
  const firstConfig = newConfig(dataDir, "stored-key-5678");
  const firstSpan = await initDb(firstConfig);
  await AuthInit(firstSpan, firstConfig);

  const secondConfig = newConfig(dataDir, "");
  const secondSpan = await initDb(secondConfig);
  await AuthInit(secondSpan, secondConfig);

  expect(secondConfig.JWT_KEY).toBe("stored-key-5678");
  expect(await storedAuthKey(secondSpan)).toBe("stored-key-5678");
});

test("rotates the stored key when a new JWT_KEY is configured", async () => {
  const dataDir = newTempDir();
  const firstConfig = newConfig(dataDir, "old-key");
  const firstSpan = await initDb(firstConfig);
  await AuthInit(firstSpan, firstConfig);

  const user = new User();
  const tokenWithOldKey = jwt.sign({ userId: user.id }, "old-key");

  const secondConfig = newConfig(dataDir, "new-key");
  const secondSpan = await initDb(secondConfig);
  await AuthInit(secondSpan, secondConfig);

  expect(secondConfig.JWT_KEY).toBe("new-key");
  expect(await storedAuthKey(secondSpan)).toBe("new-key");

  const staleSession = await AuthGetUserSession({
    headers: { authorization: `Bearer ${tokenWithOldKey}` },
  });
  expect(staleSession.isAuthenticated).toBe(false);

  await insertUser(secondSpan, user);
  const freshToken = await AuthGenerateJWT(user);
  const freshSession = await AuthGetUserSession({
    headers: { authorization: `Bearer ${freshToken}` },
  });
  expect(freshSession.isAuthenticated).toBe(true);
  expect(freshSession.userId).toBe(user.id);
});

test("accepts a legacy token without a tokenVersion claim at version 0", async () => {
  const config = newConfig(newTempDir(), "legacy-key");
  const span = await initDb(config);
  await AuthInit(span, config);

  const user = new User();
  user.name = "alice";
  await insertUser(span, user);

  const legacyToken = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + config.JWT_VALIDITY_DURATION,
      userId: user.id,
      userName: user.name,
    },
    config.JWT_KEY,
  );
  const session = await AuthGetUserSession({
    headers: { authorization: `Bearer ${legacyToken}` },
  });
  expect(session.isAuthenticated).toBe(true);
  expect(session.userId).toBe(user.id);
});

test("rejects tokens issued before a password change", async () => {
  const config = newConfig(newTempDir(), "versioned-key");
  const span = await initDb(config);
  await AuthInit(span, config);

  const user = new User();
  user.name = "alice";
  await insertUser(span, user);

  const oldToken = await AuthGenerateJWT(user);
  const beforeChange = await AuthGetUserSession({
    headers: { authorization: `Bearer ${oldToken}` },
  });
  expect(beforeChange.isAuthenticated).toBe(true);

  await DbUtilsExecSQL(
    span,
    "UPDATE users SET tokenVersion = 1 WHERE id = ?",
    [user.id],
  );
  const afterChange = await AuthGetUserSession({
    headers: { authorization: `Bearer ${oldToken}` },
  });
  expect(afterChange.isAuthenticated).toBe(false);

  user.tokenVersion = 1;
  const newToken = await AuthGenerateJWT(user);
  const currentSession = await AuthGetUserSession({
    headers: { authorization: `Bearer ${newToken}` },
  });
  expect(currentSession.isAuthenticated).toBe(true);
  expect(currentSession.userId).toBe(user.id);
});

test("rejects a token whose user row does not exist", async () => {
  const config = newConfig(newTempDir(), "deleted-user-key");
  const span = await initDb(config);
  await AuthInit(span, config);

  const user = new User();
  user.name = "deleted";
  const token = await AuthGenerateJWT(user);

  const session = await AuthGetUserSession({
    headers: { authorization: `Bearer ${token}` },
  });
  expect(session.isAuthenticated).toBe(false);
});

test("repeated boots without a configured key keep the same key", async () => {
  const dataDir = newTempDir();
  const firstConfig = newConfig(dataDir, "");
  const firstSpan = await initDb(firstConfig);
  await AuthInit(firstSpan, firstConfig);
  const generatedKey = firstConfig.JWT_KEY;

  const secondConfig = newConfig(dataDir, "");
  const secondSpan = await initDb(secondConfig);
  await AuthInit(secondSpan, secondConfig);

  expect(secondConfig.JWT_KEY).toBe(generatedKey);
  expect(await storedAuthKey(secondSpan)).toBe(generatedKey);
});
