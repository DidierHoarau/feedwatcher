import { FastifyInstance } from "fastify";
import { AuthGetUserSession } from "../users/Auth";
import { SummaryGetCached } from "./Summary";

export class SummaryRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const cached = await SummaryGetCached(userSession.userId);
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
