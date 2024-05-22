import { FastifyInstance, RequestGenericInterface } from "fastify";
import { ListItem } from "../model/ListItem";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";
import { ListsItemsDataAdd, ListsItemsDataDeleteForUser, ListsItemsDataGetItemForUser } from "./ListsItemsData";
import { AuthGetUserSession } from "../users/Auth";

export class ListsItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetListItemsIdRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.get<GetListItemsIdRequest>("/items/:itemId", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItem = await ListsItemsDataGetItemForUser(
        StandardTracerGetSpanFromRequest(req),
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
      const userSession = await AuthGetUserSession(req);
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
      ListsItemsDataAdd(StandardTracerGetSpanFromRequest(req), listItem);
      return res.status(201).send({});
    });

    interface DeleteListNameItemsRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.delete<DeleteListNameItemsRequest>("/items/:itemId", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      ListsItemsDataDeleteForUser(StandardTracerGetSpanFromRequest(req), req.params.itemId, userSession.userId);
      return res.status(202).send({});
    });
  }
}
