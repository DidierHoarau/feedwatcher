import { FastifyInstance, RequestGenericInterface } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { DbUtilsWithLock } from "@devopsplaybook.io/common-utils";
import { User } from "../model/User";
import { OTelRequestSpan } from "../OTelContext";
import { AuthGenerateJWT, AuthGetUserSession } from "./Auth";
import {
  UserPasswordCheckPassword,
  UserPasswordSetPassword,
} from "./UserPassword";
import {
  UsersDataAdd,
  UsersDataGet,
  UsersDataGetByName,
  UsersDataList,
  UsersDataUpdate,
} from "./UsersData";

const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 60 * 1000;
const loginFailures: any = {};

// Brute-force protection per username: too many failures in the window
// lock the account name for the rest of the window.
function loginIsRateLimited(name: string): boolean {
  const state = loginFailures[name];
  if (!state) {
    return false;
  }
  const now = Date.now();
  state.failures = state.failures.filter(
    (timestamp: number) => now - timestamp < LOGIN_WINDOW_MS,
  );
  if (state.failures.length === 0) {
    delete loginFailures[name];
    return false;
  }
  return state.failures.length >= LOGIN_MAX_FAILURES;
}

function loginRecordFailure(name: string): void {
  const state = loginFailures[name] || { failures: [] };
  state.failures.push(Date.now());
  loginFailures[name] = state;
}

function loginClearFailures(name: string): void {
  delete loginFailures[name];
}

export class UsersRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    await fastify.register(rateLimit, { global: false });

    fastify.get("/status/initialization", async (req, res) => {
      if ((await UsersDataList(OTelRequestSpan(req))).length === 0) {
        res.status(201).send({ initialized: false });
      } else {
        res.status(201).send({ initialized: true });
      }
    });

    interface PostSession extends RequestGenericInterface {
      Body: {
        name: string;
        password: string;
      };
    }
    fastify.post<PostSession>(
      "/session",
      {
        config: {
          rateLimit: { max: 10, timeWindow: "1 minute" },
        },
      },
      async (req, res) => {
        let user: User;
        // From token
        const userSession = await AuthGetUserSession(req);
        if (userSession.isAuthenticated) {
          user = await UsersDataGet(OTelRequestSpan(req), userSession.userId);
          if (!user) {
            return res.status(401).send({ error: "Authentication Failed" });
          }
          return res
            .status(201)
            .send({ success: true, token: await AuthGenerateJWT(user) });
        }

        // From User/Pass
        if (!req.body.name) {
          return res.status(400).send({ error: "Missing: Name" });
        }
        if (!req.body.password) {
          return res.status(400).send({ error: "Missing: Password" });
        }
        if (loginIsRateLimited(req.body.name)) {
          return res.status(429).send({ error: "Too Many Requests" });
        }
        user = await UsersDataGetByName(OTelRequestSpan(req), req.body.name);
        if (!user) {
          loginRecordFailure(req.body.name);
          return res.status(403).send({ error: "Authentication Failed" });
        } else if (
          await UserPasswordCheckPassword(
            OTelRequestSpan(req),
            user,
            req.body.password
          )
        ) {
          loginClearFailures(req.body.name);
          return res
            .status(201)
            .send({ success: true, token: await AuthGenerateJWT(user) });
        } else {
          loginRecordFailure(req.body.name);
          return res.status(403).send({ error: "Authentication Failed" });
        }
      }
    );

    interface PostUser extends RequestGenericInterface {
      Body: {
        name: string;
        password: string;
      };
    }
    fastify.post<PostUser>("/", async (req, res) => {
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      if (!req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      // Account creation is bootstrap-only: it is allowed while the user
      // base is empty (first run). Afterwards, users are created by the
      // operator directly in the database.
      const user = new User();
      user.name = req.body.name;
      const created = await DbUtilsWithLock("users_bootstrap", async () => {
        if ((await UsersDataList(OTelRequestSpan(req))).length > 0) {
          return false;
        }
        if (await UsersDataGetByName(OTelRequestSpan(req), req.body.name)) {
          return "duplicate";
        }
        await UserPasswordSetPassword(
          OTelRequestSpan(req),
          user,
          req.body.password
        );
        await UsersDataAdd(OTelRequestSpan(req), user);
        return true;
      });
      if (created === false) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (created === "duplicate") {
        return res.status(400).send({ error: "Username Already Exists" });
      }
      res.status(201).send({});
    });

    interface PutNewPassword extends RequestGenericInterface {
      Body: {
        password: string;
        passwordOld: string;
      };
    }
    fastify.put<PutNewPassword>("/password", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const user = await UsersDataGet(OTelRequestSpan(req), userSession.userId);
      if (!req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      if (
        !(await UserPasswordCheckPassword(
          OTelRequestSpan(req),
          user,
          req.body.passwordOld
        ))
      ) {
        return res.status(403).send({ error: "Old Password Wrong" });
      }
      await UserPasswordSetPassword(
        OTelRequestSpan(req),
        user,
        req.body.password
      );
      await UsersDataUpdate(OTelRequestSpan(req), user);
      res.status(201).send({});
    });
  }
}
