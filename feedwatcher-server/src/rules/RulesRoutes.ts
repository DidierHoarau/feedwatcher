import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Rules } from "../model/Rules";
import { RulesDataListForUser, RulesDataUpdate } from "./RulesData";
import { AuthGetUserSession } from "../users/Auth";
import { OTelRequestSpan } from "../OTelContext";

export class RulesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const rules = await RulesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId
      );
      return res.status(200).send({ rules });
    });

    interface PutRules extends RequestGenericInterface {
      Body: {
        rules: Rules;
      };
    }
    fastify.put<PutRules>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const rules = Rules.fromJson(req.body.rules);
      rules.userId = userSession.userId;
      await RulesDataUpdate(OTelRequestSpan(req), rules);
      return res.status(201).send({});
    });
  }
}
