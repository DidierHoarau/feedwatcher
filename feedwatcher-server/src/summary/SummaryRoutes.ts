import { FastifyInstance } from "fastify";
import { Config } from "../Config";
import { OTelRequestSpan } from "../OTelContext";
import { AuthGetUserSession } from "../users/Auth";
import { SummaryGetCached } from "./Summary";

let config: Config;

export function SummaryRoutesInit(configIn: Config) {
  config = configIn;
}

export class SummaryRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const cached = SummaryGetCached(userSession.userId);
      if (!cached) {
        return res
          .status(200)
          .send({ itemCount: 0, summary: "", generatedAt: null });
      }
      return res.status(200).send({
        itemCount: cached.itemCount,
        summary: cached.summary,
        generatedAt: cached.generatedAt,
      });
    });
  }
}
