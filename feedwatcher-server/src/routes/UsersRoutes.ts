import { FastifyInstance, RequestGenericInterface } from "fastify";
import { UserPassword } from "../data/UserPassword";
import { Auth } from "../data/Auth";
import { User } from "../common-model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { UsersData } from "../data/UsersData";

let usersData: UsersData;

export class UserRoutes {
  //
  constructor(usersDataIn: UsersData) {
    usersData = usersDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/status/initialization", async (req, res) => {
      if ((await usersData.list(StandardTracer.getSpanFromRequest(req))).length === 0) {
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
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      if (!req.body.password) {
        return res.status(400).send({ error: "Missing: Password" });
      }
      const user = await usersData.getByName(StandardTracer.getSpanFromRequest(req), req.body.name);
      if (!user) {
        return res.status(403).send({ error: "Authentication Failed" });
      } else if (await UserPassword.checkPassword(StandardTracer.getSpanFromRequest(req), user, req.body.password)) {
        res.status(201).send({ success: true, token: await Auth.generateJWT(user) });
      } else {
        return res.status(403).send({ error: "Authentication Failed" });
      }
    });

    fastify.get("/", async (req, res) => {
      await Auth.mustBeAuthenticated(req, res);
      const users = await usersData.list(StandardTracer.getSpanFromRequest(req));
      for (const user of users) {
        delete user.passwordEncrypted;
      }
      res.status(201).send({ users });
    });

    interface PostUser extends RequestGenericInterface {
      Body: {
        name: string;
        password: string;
      };
    }
    fastify.post<PostUser>("/", async (req, res) => {
      let isInitialized = true;
      if ((await usersData.list(StandardTracer.getSpanFromRequest(req))).length === 0) {
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
      if (await usersData.getByName(StandardTracer.getSpanFromRequest(req), req.body.name)) {
        return res.status(400).send({ error: "Username Already Exists" });
      }
      newUser.name = req.body.name;
      await UserPassword.setPassword(StandardTracer.getSpanFromRequest(req), newUser, req.body.password);
      await usersData.add(StandardTracer.getSpanFromRequest(req), newUser);
      res.status(201).send({});
    });
  }
}
