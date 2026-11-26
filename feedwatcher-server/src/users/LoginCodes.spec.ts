import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import Fastify, { FastifyInstance } from "fastify";
import {
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
  LOGIN_CODES_DDL_SQLITE,
  LoginCodesRoutes,
  createLoginCodesStoreCommonUtils,
  type LoginCodesRoutesOptions,
  type LoginCodesStore,
} from "@devopsplaybook.io/common-utils";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import { Config } from "../Config";
import { User } from "../model/User";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../OTelContext";
import { AuthGenerateJWT, AuthGetUserSession, AuthInit } from "./Auth";
import {
  LoginCodesBuildRoutesOptions,
  LoginCodesBuildSettings,
  LoginCodesLogEvent,
} from "./LoginCodes";
import { UsersDataAdd, UsersDataGet } from "./UsersData";
import { UserPasswordSetPassword } from "./UserPassword";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-login-codes-"));
const SQL_DIR = path.join(__dirname, "..", "..", "sql");
const PASSWORD = "correct-password";
const PREFIX = "/api/users/login-codes";
const CHROME_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let config: Config;
let user: User;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestWith(headers: Record<string, string>): any {
  return { headers };
}

async function bearerFor(userIn: User): Promise<string> {
  return `Bearer ${await AuthGenerateJWT(userIn)}`;
}

async function dbVersion(): Promise<number> {
  const [row] = await DbUtilsQuerySQL(
    undefined,
    "SELECT MAX(CAST(value AS INTEGER)) as version FROM metadata WHERE type='db_version'",
  );
  return Number(row.version);
}

async function buildApp(
  overrides: Partial<LoginCodesRoutesOptions> = {},
  store: LoginCodesStore = createLoginCodesStoreCommonUtils(),
): Promise<FastifyInstance> {
  const options: LoginCodesRoutesOptions = {
    ...LoginCodesBuildRoutesOptions(config, store),
    ...overrides,
  };
  const app = Fastify();
  await app.register(
    async (instance) => {
      await LoginCodesRoutes(instance, options);
    },
    { prefix: PREFIX },
  );
  await app.ready();
  return app;
}

beforeAll(async () => {
  // Deterministic defaults regardless of the ambient environment.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("LOGIN_CODE_")) {
      delete process.env[key];
    }
  }
  await fs.remove(DATA_DIR);
  await fs.ensureDir(DATA_DIR);
  config = new Config();
  config.DATA_DIR = DATA_DIR;
  config.DATABASE_TYPE = "sqlite";
  config.JWT_KEY = "test-signing-key";
  config.LOGIN_CODE_ENABLED = true;
  OTelSetTracer(new StandardTracer(config));
  DbUtilsSetOTel(OTelTracer(), OTelLogger());
  const span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);
  await AuthInit(span, config);
  user = new User();
  user.name = "ann";
  await UserPasswordSetPassword(undefined, user, PASSWORD);
  await UsersDataAdd(undefined, user);
});

afterAll(async () => {
  const db = DbUtilsGetDatabase();
  if (db && typeof db.close === "function") {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  await fs.remove(DATA_DIR);
});

beforeEach(() => {
  DbUtilsExecSQL(undefined, 'DELETE FROM "users_login_codes"');
});

describe("database migration", () => {
  it("creates the login code table on a fresh database", () => {
    const tables = DbUtilsQuerySQL(
      undefined,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users_login_codes'",
    );
    expect(tables).toHaveLength(1);
  });

  it("records db_version 16", async () => {
    expect(await dbVersion()).toBe(16);
  });

  it("re-applying the migrations is a no-op", async () => {
    await expect(
      DbUtilsInit(undefined, config, SQL_DIR),
    ).resolves.toBeUndefined();
    expect(await dbVersion()).toBe(16);
  });

  it("ships the library DDL verbatim in init-0016.sql", () => {
    const migration = fs.readFileSync(
      path.join(SQL_DIR, "init-0016.sql"),
      "utf8",
    );
    expect(migration).toContain(LOGIN_CODES_DDL_SQLITE);
  });
});

describe("LoginCodesBuildSettings", () => {
  it("should read the application defaults", () => {
    const settings = LoginCodesBuildSettings(new Config());
    expect(settings).toMatchObject({
      enabled: false,
      ttlSeconds: 300,
      rotationSeconds: 30,
      graceSeconds: 60,
      pollIntervalMs: 2000,
      maxAttempts: 5,
      maxPending: 100,
      rateLimitCreateMax: 10,
      rateLimitPollMax: 120,
      rateLimitApproveMax: 10,
      rateLimitWindowSeconds: 60,
      approveRequiresPassword: false,
    });
  });

  it("should reflect the enabled flag and apply the library clamps", () => {
    const overrides = new Config();
    overrides.LOGIN_CODE_ENABLED = true;
    overrides.LOGIN_CODE_TTL_SECONDS = 1;
    overrides.LOGIN_CODE_ROTATION_SECONDS = 1;
    overrides.LOGIN_CODE_GRACE_SECONDS = 9999;
    const settings = LoginCodesBuildSettings(overrides);
    expect(settings.enabled).toBe(true);
    expect(settings.ttlSeconds).toBe(30);
    expect(settings.rotationSeconds).toBe(5);
    expect(settings.graceSeconds).toBe(600);
  });
});

describe("LoginCodesLogEvent", () => {
  it("should log only allow-listed fields and never a code or token", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      LoginCodesLogEvent({
        type: "login_code_approved",
        requestId: "req-1",
        userId: "user-1",
        userName: "ann",
        deviceLabel: "Chrome on macOS",
        reason: "attempts_exceeded",
        ip: "203.0.113.4",
        // Secrets smuggled into the event must never be written out.
        code: "BCDFGHJK",
        requestToken: "raw-request-token",
      } as never);

      const output = String(spy.mock.calls[0][0]);
      expect(output).toContain("[LoginCodes]");
      expect(output).toContain('"requestId":"req-1"');
      expect(output).toContain('"userId":"user-1"');
      expect(output).toContain('"reason":"attempts_exceeded"');
      expect(output).not.toContain("BCDFGHJK");
      expect(output).not.toContain("raw-request-token");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("LoginCodesBuildRoutesOptions hooks", () => {
  it("should resolve an interactive JWT approver", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    const approver = await options.getApprovingUser(
      requestWith({ authorization: await bearerFor(user) }),
    );
    expect(approver).toEqual({ id: user.id, name: user.name });
  });

  it("should return null without a session", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    expect(await options.getApprovingUser(requestWith({}))).toBeNull();
  });

  it("should return null for an invalid bearer token", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    expect(
      await options.getApprovingUser(
        requestWith({ authorization: "Bearer not-a-jwt" }),
      ),
    ).toBeNull();
  });

  it("should issue a session the application auth accepts", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    const session = await options.issueSession(
      { id: user.id, name: user.name },
      {} as never,
    );
    expect(session.user).toEqual({ id: user.id, name: user.name });
    expect(session.user).not.toHaveProperty("passwordEncrypted");
    const verified = await AuthGetUserSession(
      requestWith({ authorization: `Bearer ${session.token}` }),
    );
    expect(verified.isAuthenticated).toBe(true);
    expect(verified.userId).toBe(user.id);
  });

  it("should fail closed at redemption when the approver is gone", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    await expect(
      options.issueSession({ id: "does-not-exist", name: "ghost" }, {} as never),
    ).rejects.toThrow(/no longer exists/);
  });

  it("should verify the password against the live user", async () => {
    const options = LoginCodesBuildRoutesOptions(config);
    const approver = { id: user.id, name: user.name };
    expect(await options.verifyPassword(approver, PASSWORD)).toBe(true);
    expect(await options.verifyPassword(approver, "wrong")).toBe(false);
    expect(
      await options.verifyPassword({ id: "gone", name: "ghost" }, PASSWORD),
    ).toBe(false);
  });

  it("should resolve the user by id and fail closed after deletion", async () => {
    const doomed = new User();
    doomed.name = "doomed";
    await UserPasswordSetPassword(undefined, doomed, PASSWORD);
    await UsersDataAdd(undefined, doomed);

    const options = LoginCodesBuildRoutesOptions(config);
    expect(await options.getUserById(doomed.id)).toEqual({
      id: doomed.id,
      name: doomed.name,
    });
    expect(await UsersDataGet(undefined, doomed.id)).not.toBeNull();
    DbUtilsExecSQL(undefined, "DELETE FROM users WHERE id=?", [doomed.id]);
    expect(await options.getUserById(doomed.id)).toBeNull();
  });
});

describe("login-code routes", () => {
  it("should advertise the enabled feature without caching", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: `${PREFIX}/capabilities`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toMatchObject({
        enabled: true,
        available: true,
        codeLength: 8,
        rotationSeconds: 30,
        graceSeconds: 60,
        ttlSeconds: 300,
        pollIntervalMs: 2000,
        approveRequiresPassword: false,
      });
    } finally {
      await app.close();
    }
  });

  it("should report the feature disabled and refuse to create codes", async () => {
    const app = await buildApp({ enabled: false });
    try {
      const capabilities = await app.inject({
        method: "GET",
        url: `${PREFIX}/capabilities`,
      });
      expect(capabilities.json()).toMatchObject({
        enabled: false,
        available: false,
      });
      const created = await app.inject({
        method: "POST",
        url: `${PREFIX}/`,
        payload: {},
      });
      expect(created.statusCode).toBe(503);
      expect(created.json().code).toBe("LOGIN_CODE_UNAVAILABLE");
    } finally {
      await app.close();
    }
  });

  it("should require an interactive session to preview and approve", async () => {
    const app = await buildApp();
    try {
      const created = await app.inject({
        method: "POST",
        url: `${PREFIX}/`,
        payload: {},
        headers: { "user-agent": CHROME_MAC_UA },
      });
      expect(created.statusCode).toBe(201);
      const code = created.json().code;

      const anonymous = await app.inject({
        method: "POST",
        url: `${PREFIX}/preview`,
        payload: { code },
      });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json().code).toBe("UNAUTHENTICATED");

      const badJwt = await app.inject({
        method: "POST",
        url: `${PREFIX}/preview`,
        payload: { code },
        headers: { authorization: "Bearer not-a-jwt" },
      });
      expect(badJwt.statusCode).toBe(401);
      expect(badJwt.json().code).toBe("UNAUTHENTICATED");

      const nonJwt = await app.inject({
        method: "POST",
        url: `${PREFIX}/approve`,
        payload: { code },
        headers: { "x-upload-token": "an-upload-token" },
      });
      expect(nonJwt.statusCode).toBe(401);
      expect(nonJwt.json().code).toBe("UNAUTHENTICATED");
    } finally {
      await app.close();
    }
  });

  it("should run the full create → approve → redeem flow issuing an app session", async () => {
    const app = await buildApp();
    try {
      const created = await app.inject({
        method: "POST",
        url: `${PREFIX}/`,
        payload: {},
        headers: { "user-agent": CHROME_MAC_UA },
      });
      expect(created.statusCode).toBe(201);
      const { code, requestToken } = created.json();
      expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);

      const authorization = await bearerFor(user);
      const preview = await app.inject({
        method: "POST",
        url: `${PREFIX}/preview`,
        payload: { code },
        headers: { authorization },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        deviceLabel: "Chrome on macOS",
        userName: user.name,
      });

      const approve = await app.inject({
        method: "POST",
        url: `${PREFIX}/approve`,
        payload: { code },
        headers: { authorization },
      });
      expect(approve.statusCode).toBe(200);
      expect(approve.json().approved).toBe(true);

      const polled = await app.inject({
        method: "POST",
        url: `${PREFIX}/poll`,
        payload: { requestToken },
      });
      expect(polled.statusCode).toBe(200);
      const redeemed = polled.json();
      expect(redeemed.status).toBe("approved");
      expect(redeemed.user).toMatchObject({ id: user.id, name: user.name });

      const verified = await AuthGetUserSession(
        requestWith({ authorization: `Bearer ${redeemed.token}` }),
      );
      expect(verified.isAuthenticated).toBe(true);
      expect(verified.userId).toBe(user.id);

      const reuse = await app.inject({
        method: "POST",
        url: `${PREFIX}/poll`,
        payload: { requestToken },
      });
      expect(reuse.statusCode).toBe(409);
      expect(reuse.json().code).toBe("ALREADY_USED");
    } finally {
      await app.close();
    }
  });
});
