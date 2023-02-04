import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourceItemsSavedData } from "../data/SourceItemsSavedData";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class SourceItemsSavedRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetSourceItemsSavedRequest extends RequestGenericInterface {
      Params: {
        listName: string;
      };
    }
    fastify.get<GetSourceItemsSavedRequest>("/:listName", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItems = await SourceItemsSavedData.listItemsForUser(
        StandardTracer.getSpanFromRequest(req),
        req.params.listName,
        userSession.userId
      );
      return res.status(201).send({ sourceItems });
    });

    interface GetSourceItemsSavedItemIdRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.get<GetSourceItemsSavedItemIdRequest>("/items/:itemId", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItem = await SourceItemsSavedData.getItemForUser(
        StandardTracer.getSpanFromRequest(req),
        req.params.itemId,
        userSession.userId
      );
      return res.status(201).send(sourceItem || {});
    });
  }
}
