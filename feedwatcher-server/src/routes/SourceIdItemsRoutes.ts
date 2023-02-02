import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourceItemsData } from "../data/SourceItemsData";
import { SourcesData } from "../data/SourcesData";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class SourceIditemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetSourceIdItemsRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.get<GetSourceIdItemsRequest>("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (source.userId !== userSession.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItems = await SourceItemsData.listForSource(StandardTracer.getSpanFromRequest(req), source.id);
      return res.status(201).send({ sourceItems });
    });
  }
}
