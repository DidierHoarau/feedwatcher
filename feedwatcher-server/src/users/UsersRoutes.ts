import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "./Auth";
import { User } from "../model/User";
import { UsersData } from "./UsersData";
import { UserPassword } from "./UserPassword";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";

export class UsersRoutes {
  //

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/status/initialization", async (req, res) => {
      if ((await UsersData.list(StandardTracerGetSpanFromRequest(req))).length === 0) {
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
    fastify.post<PostSession>("/session", async (req, res) => {
      let user: User;
      // From token
      const userSession = await Auth.getUserSession(req);
      if (userSession.isAuthenticated) {
        user = await UsersData.get(StandardTracerGetSpanFromRequest(req), userSession.userId);
        return res.status(201).send({ success: true, token: await Auth.generateJWT(user) });
      }

      // From User/Pass
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      if (!req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      user = await UsersData.getByName(StandardTracerGetSpanFromRequest(req), req.body.name);
      if (!user) {
        return res.status(403).send({ error: "Authentication Failed" });
      } else if (await UserPassword.checkPassword(StandardTracerGetSpanFromRequest(req), user, req.body.password)) {
        return res.status(201).send({ success: true, token: await Auth.generateJWT(user) });
      } else {
        return res.status(403).send({ error: "Authentication Failed" });
      }
    });

    interface PostUser extends RequestGenericInterface {
      Body: {
        name: string;
        password: string;
      };
    }
    fastify.post<PostUser>("/", async (req, res) => {
      let isInitialized = true;
      if ((await UsersData.list(StandardTracerGetSpanFromRequest(req))).length === 0) {
        isInitialized = false;
      }
      const userSession = await Auth.getUserSession(req);
      if (isInitialized && !userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const newUser = new User();
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      if (!req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      if (await UsersData.getByName(StandardTracerGetSpanFromRequest(req), req.body.name)) {
        return res.status(400).send({ error: "Username Already Exists" });
      }
      newUser.name = req.body.name;
      await UserPassword.setPassword(StandardTracerGetSpanFromRequest(req), newUser, req.body.password);
      await UsersData.add(StandardTracerGetSpanFromRequest(req), newUser);
      res.status(201).send({});
    });

    interface PutNewPassword extends RequestGenericInterface {
      Body: {
        password: string;
        passwordOld: string;
      };
    }
    fastify.put<PutNewPassword>("/password", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const user = await UsersData.get(StandardTracerGetSpanFromRequest(req), userSession.userId);
      if (!req.body.password || !req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      if (!(await UserPassword.checkPassword(StandardTracerGetSpanFromRequest(req), user, req.body.passwordOld))) {
        return res.status(403).send({ error: "Old Password Wrong" });
      }
      await UserPassword.setPassword(StandardTracerGetSpanFromRequest(req), user, req.body.password);
      await UsersData.update(StandardTracerGetSpanFromRequest(req), user);
      res.status(201).send({});
    });
  }
}
