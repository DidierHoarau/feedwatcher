import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../users/Auth";
import { SearchItemsData } from "./SearchItemsData";
import { SourceItemsData } from "./SourceItemsData";
import { SourcesData } from "./SourcesData";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PostSourceItemsSearchRequest extends RequestGenericInterface {
      Body: {
        searchCriteria: string;
        page: number;
        filterStatus: SourceItemStatus;
        labelName: string;
        sourceId: string;
        isSaved: boolean;
      };
    }

    fastify.post<PostSourceItemsSearchRequest>("/search", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
        //
      }

      if (req.body.searchCriteria === "labelName" && !req.body.labelName) {
        return res.status(400).send({ error: "Missing Parameter: labelName" });
      }

      if (req.body.searchCriteria === "sourceId" && !req.body.sourceId) {
        return res.status(400).send({ error: "Missing Parameter: sourceId" });
      }

      const searchOptions = new SearchItemsOptions();
      searchOptions.page = req.body.page || 1;
      searchOptions.filterStatus = req.body.filterStatus || SourceItemStatus.unread;
      searchOptions.isSaved = req.body.isSaved ? true : false;
      console.log(searchOptions);

      if (req.body.searchCriteria === "labelName") {
        const searchItemsResult = await SearchItemsData.listItemsForLabel(
          StandardTracer.getSpanFromRequest(req),
          req.body.labelName,
          userSession.userId,
          searchOptions
        );
        return res.status(200).send(searchItemsResult);
      }

      if (req.body.searchCriteria === "sourceId") {
        const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.body.sourceId);
        if (source.userId !== userSession.userId) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const searchItemsResult = await SearchItemsData.listForSource(
          StandardTracer.getSpanFromRequest(req),
          source.id,
          searchOptions
        );
        return res.status(200).send(searchItemsResult);
      }

      if (req.body.searchCriteria === "all") {
        const searchItemsResult = await SearchItemsData.listForUser(
          StandardTracer.getSpanFromRequest(req),
          userSession.userId,
          searchOptions
        );
        return res.status(200).send(searchItemsResult);
      }

      return res.status(400).send({ error: "Search Criteria Missing or Unknown" });
    });

    interface PutSourceItemIdStatusRequest extends RequestGenericInterface {
      Body: {
        itemIds: string[];
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

      await SourceItemsData.updateMultipleStatusForUser(
        StandardTracer.getSpanFromRequest(req),
        req.body.itemIds,
        req.body.status,
        userSession.userId
      );
      return res.status(201).send({});
    });
  }
}
