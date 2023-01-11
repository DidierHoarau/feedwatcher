import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { UserPassword } from "../data/UserPassword";
import { User } from "../common-model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { UsersData } from "../data/UsersData";

let usersData: UsersData;

export class UserIdRoutes {
  //
  constructor(usersDataIn: UsersData) {
    usersData = usersDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetUserRequest extends RequestGenericInterface {
      Params: {
        userId: string;
      };
    }
    fastify.get<GetUserRequest>("/", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const user = await usersData.get(StandardTracer.getSpanFromRequest(req), req.params.userId);
      if (!user) {
        return res.status(404).send({ error: "Not Found" });
      }
      delete user.passwordEncrypted;
      res.status(201).send(user);
    });

    interface PutUserRequest extends RequestGenericInterface {
      Params: {
        userId: string;
      };
      Body: {
        name: string;
        password: string;
      };
    }
    fastify.put<PutUserRequest>("/", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const user = await usersData.get(StandardTracer.getSpanFromRequest(req), req.params.userId);
      if (!user) {
        return res.status(404).send({ error: "Not Found" });
      }
      const userUpddate = new User();
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      userUpddate.name = req.body.name;
      if (req.body.password) {
        await UserPassword.setPassword(StandardTracer.getSpanFromRequest(req), userUpddate, req.body.password);
      }
      await usersData.update(StandardTracer.getSpanFromRequest(req), user.id, userUpddate);
      res.status(201).send({});
    });

    interface DeleteUserRequest extends RequestGenericInterface {
      Params: {
        userId: string;
      };
    }
    fastify.delete<DeleteUserRequest>("/", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const user = await usersData.get(StandardTracer.getSpanFromRequest(req), req.params.userId);
      if (!user) {
        return res.status(404).send({ error: "Not Found" });
      }
      await usersData.delete(StandardTracer.getSpanFromRequest(req), user.id);
      res.status(201).send({});
    });
  }
}
