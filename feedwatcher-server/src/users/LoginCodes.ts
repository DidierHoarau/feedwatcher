import {
  LoginCodesOptionsFromConfig,
  createLoginCodesStoreCommonUtils,
  type LoginCodesEvent,
  type LoginCodesRoutesOptions,
  type LoginCodesSettings,
  type LoginCodesStore,
} from "@devopsplaybook.io/common-utils";
import { Config } from "../Config";
import { OTelLogger, OTelRequestSpan } from "../OTelContext";
import { AuthGenerateJWT, AuthGetUserSession } from "./Auth";
import { UsersDataGet } from "./UsersData";
import { UserPasswordCheckPassword } from "./UserPassword";

const logger = OTelLogger().createModuleLogger("LoginCodes");

/** Apply the LOGIN_CODE_* defaults/clamps read from this app's config. */
export function LoginCodesBuildSettings(config: Config): LoginCodesSettings {
  return LoginCodesOptionsFromConfig(config);
}

/** Allow-listed audit fields only: never a code, request token or hash. */
export function LoginCodesLogEvent(event: LoginCodesEvent): void {
  logger.info(
    "[LoginCodes] " +
      JSON.stringify({
        type: event.type,
        requestId: event.requestId,
        userId: event.userId,
        userName: event.userName,
        deviceLabel: event.deviceLabel,
        reason: event.reason,
        ip: event.ip,
      }),
  );
}

/**
 * Build the `LoginCodesRoutes` options for feedwatcher: the DB-backed store, an
 * approver resolved from this app's own JWT session, a session issuer matching
 * the password login, the app's bcrypt password check and the event log.
 */
export function LoginCodesBuildRoutesOptions(
  config: Config,
  store: LoginCodesStore = createLoginCodesStoreCommonUtils(),
): LoginCodesRoutesOptions {
  return {
    ...LoginCodesBuildSettings(config),
    store,
    // Lazy: AuthInit() has populated JWT_KEY by the first request. An empty
    // key makes the feature answer 503, never a boot crash.
    hashKey: () => config.JWT_KEY,
    getApprovingUser: async (req) => {
      // Only this app's own JWT is a session; any other credential -> null.
      const session = await AuthGetUserSession(req);
      if (!session.isAuthenticated) {
        return null;
      }
      const user = await UsersDataGet(
        OTelRequestSpan(req),
        session.userId,
      );
      return user ? { id: user.id, name: user.name } : null;
    },
    getUserById: async (id) => {
      const user = await UsersDataGet(undefined, id);
      return user ? { id: user.id, name: user.name } : null;
    },
    issueSession: async (approver) => {
      // Re-read live: a deleted approver aborts redemption (fail closed).
      const user = await UsersDataGet(undefined, approver.id);
      if (!user) {
        throw new Error("Login code approver no longer exists");
      }
      return {
        token: await AuthGenerateJWT(user), // same payload as password login
        user: { id: user.id, name: user.name }, // never passwordEncrypted
      };
    },
    verifyPassword: async (approver, password) => {
      const user = await UsersDataGet(undefined, approver.id);
      return user
        ? UserPasswordCheckPassword(undefined, user, password)
        : false;
    },
    onEvent: LoginCodesLogEvent,
  };
}
