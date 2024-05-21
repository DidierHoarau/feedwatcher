import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../users/Auth";
import { Rules } from "../model/Rules";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";
import { RulesDataListForUser, RulesDataUpdate } from "./RulesData";

export class RulesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const rules = await RulesDataListForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
      return res.status(200).send({ rules });
    });

    interface PutRules extends RequestGenericInterface {
      Body: {
        rules: Rules;
      };
    }
    fastify.put<PutRules>("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const rules = Rules.fromJson(req.body.rules);
      rules.userId = userSession.userId;
      await RulesDataUpdate(StandardTracerGetSpanFromRequest(req), rules);
      return res.status(201).send({});
    });
  }
}
