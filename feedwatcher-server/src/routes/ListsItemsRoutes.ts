import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { ListsItemsData } from "../data/ListsItemsData";
import { ListItem } from "../model/ListItem";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ListsItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/items", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItems = await ListsItemsData.listItemsForUser(
        StandardTracer.getSpanFromRequest(req),
        userSession.userId
      );
      return res.status(201).send({ sourceItems });
    });

    interface GetListItemsIdRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.get<GetListItemsIdRequest>("/items/:itemId", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItem = await ListsItemsData.getItemForUser(
        StandardTracer.getSpanFromRequest(req),
        req.params.itemId,
        userSession.userId
      );
      return res.status(201).send(sourceItem || {});
    });

    interface PutListNameItemsRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
      Body: {
        itemId: string;
        listName: string;
      };
    }
    fastify.put<PutListNameItemsRequest>("/items", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body.itemId) {
        return res.status(400).send({ error: "Missing Parameter: itemId" });
      }
      const listItem = new ListItem();
      listItem.itemId = req.body.itemId;
      listItem.userId = userSession.userId;
      if (req.body.listName) {
        listItem.itemId = req.body.itemId;
      }
      listItem.info.dateAdded = new Date();
      ListsItemsData.add(StandardTracer.getSpanFromRequest(req), listItem);
      return res.status(201).send({});
    });

    interface DeleteListNameItemsRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.delete<DeleteListNameItemsRequest>("/items/:itemId", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      ListsItemsData.deleteForUser(StandardTracer.getSpanFromRequest(req), req.params.itemId, userSession.userId);
      return res.status(202).send({});
    });
  }
}
