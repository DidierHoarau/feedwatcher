import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Rules } from "../model/Rules";
import { RulesDataListForUser, RulesDataUpdate } from "./RulesData";
import { AuthGetUserSession } from "../users/Auth";
import { OTelRequestSpan } from "../OTelContext";

// An invalid rules document used to be persisted and then crash the
// scheduler cycle at every execution; validate it before storing.
const rulePatternSchema = {
  type: "object",
  properties: {
    pattern: { type: "string" },
    ageDays: { anyOf: [{ type: "number" }, { type: "string" }] },
  },
};

const rulesBodySchema = {
  type: "object",
  required: ["rules"],
  properties: {
    rules: {
      type: "object",
      required: ["info"],
      properties: {
        id: { type: "string" },
        userId: { type: "string" },
        info: {
          type: "array",
          items: {
            type: "object",
            properties: {
              isRoot: { type: "boolean" },
              labelName: { type: "string" },
              sourceId: { type: "string" },
              autoRead: { type: "array", items: rulePatternSchema },
              autoDelete: { type: "array", items: rulePatternSchema },
            },
          },
        },
      },
    },
  },
};

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
    fastify.put<PutRules>(
      "/",
      { schema: { body: rulesBodySchema } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const rules = Rules.fromJson(req.body.rules);
        rules.userId = userSession.userId;
        await RulesDataUpdate(OTelRequestSpan(req), rules);
        return res.status(200).send({});
      },
    );
  }
}
