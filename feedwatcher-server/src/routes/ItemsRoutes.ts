import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { ListsItemsData } from "../data/ListsItemsData";
import { SourceItemsData } from "../data/SourceItemsData";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItems = await SourceItemsData.listForUser(StandardTracer.getSpanFromRequest(req), userSession.userId);
      return res.status(201).send({ sourceItems });
    });
  }
}
