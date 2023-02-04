import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourceItemsData } from "../data/SourceItemsData";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class SourceItemIdRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PutSourceItemIdStatusRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
      Body: {
        status: string;
      };
    }
    fastify.put<PutSourceItemIdStatusRequest>("/status", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (
        !req.body.status ||
        (req.body.status !== SourceItemStatus.read && req.body.status !== SourceItemStatus.unread)
      ) {
        return res.status(400).send({ error: "Wrong status parameter" });
      }
      const sourceItem = await SourceItemsData.getForUser(
        StandardTracer.getSpanFromRequest(req),
        req.params.itemId,
        userSession.userId
      );
      sourceItem.status = req.body.status;
      await SourceItemsData.update(StandardTracer.getSpanFromRequest(req), sourceItem);
      return res.status(201).send({});
    });
  }
}
