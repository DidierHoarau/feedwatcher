import { FastifyInstance, RequestGenericInterface } from "fastify";
import { UserPassword } from "../data/UserPassword";
import { Auth } from "../data/Auth";
import { User } from "../model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { UsersData } from "../data/UsersData";

export class UsersRoutes {
  //

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/status/initialization", async (req, res) => {
      if ((await UsersData.list(StandardTracer.getSpanFromRequest(req))).length === 0) {
        res.status(201).send({ initialized: false });
      } else {
        res.status(201).send({ initialized: true });
      }
    });
  }
}
