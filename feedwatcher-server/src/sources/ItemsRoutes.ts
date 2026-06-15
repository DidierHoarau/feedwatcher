import { FastifyInstance, RequestGenericInterface } from "fastify";
import axios from "axios";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { SourcesDataGet } from "./SourcesData";
import {
  SearchItemsDataListForSource,
  SearchItemsDataListForUser,
  SearchItemsDataListItemsForLabel,
} from "./SearchItemsData";
import { SourceItemsDataUpdateMultipleStatusForUser } from "./SourceItemsData";
import { AuthGetUserSession } from "../users/Auth";
import { OTelRequestSpan } from "../OTelContext";

export class ItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PostSourceItemsSearchRequest extends RequestGenericInterface {
      Body: {
        searchCriteria: string;
        page: number;
        beforeDate: string;
        filterStatus: SourceItemStatus;
        labelName: string;
        sourceId: string;
        isSaved: boolean;
        sinceDate: string;
        pattern: string;
      };
    }

    fastify.post<PostSourceItemsSearchRequest>("/search", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
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
      if (req.body.beforeDate) {
        searchOptions.beforeDate = new Date(req.body.beforeDate);
      }
      searchOptions.filterStatus =
        req.body.filterStatus || SourceItemStatus.unread;
      searchOptions.isSaved = req.body.isSaved ? true : false;
      if (req.body.sinceDate) {
        searchOptions.minDate = new Date(req.body.sinceDate);
      }
      if (req.body.pattern) {
        searchOptions.pattern = req.body.pattern;
      }

      if (req.body.searchCriteria === "labelName") {
        const searchItemsResult = await SearchItemsDataListItemsForLabel(
          OTelRequestSpan(req),
          req.body.labelName,
          userSession.userId,
          searchOptions,
        );
        return res.status(200).send(searchItemsResult);
      }

      if (req.body.searchCriteria === "sourceId") {
        const source = await SourcesDataGet(
          OTelRequestSpan(req),
          req.body.sourceId,
        );
        if (source.userId !== userSession.userId) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const searchItemsResult = await SearchItemsDataListForSource(
          OTelRequestSpan(req),
          source.id,
          searchOptions,
        );
        return res.status(200).send(searchItemsResult);
      }

      if (req.body.searchCriteria === "all") {
        const searchItemsResult = await SearchItemsDataListForUser(
          OTelRequestSpan(req),
          userSession.userId,
          searchOptions,
        );
        return res.status(200).send(searchItemsResult);
      }

      return res
        .status(400)
        .send({ error: "Search Criteria Missing or Unknown" });
    });

    interface PutSourceItemIdStatusRequest extends RequestGenericInterface {
      Body: {
        itemIds: string[];
        status: string;
      };
    }
    fastify.put<PutSourceItemIdStatusRequest>("/status", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (
        !req.body.status ||
        (req.body.status !== SourceItemStatus.read &&
          req.body.status !== SourceItemStatus.unread)
      ) {
        return res.status(400).send({ error: "Wrong status parameter" });
      }

      await SourceItemsDataUpdateMultipleStatusForUser(
        OTelRequestSpan(req),
        req.body.itemIds,
        req.body.status,
        userSession.userId,
      );
      return res.status(201).send({});
    });

    interface PostFetchUrlRequest extends RequestGenericInterface {
      Body: {
        url: string;
      };
    }
    fastify.post<PostFetchUrlRequest>("/fetch-url", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body.url || !req.body.url.startsWith("http")) {
        return res.status(400).send({ error: "Invalid URL" });
      }
      try {
        const response = await axios.get(req.body.url, {
          timeout: 10000,
          responseType: "text",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; FeedWatcher/1.0; +https://github.com/didierhoarau/feedwatcher)",
          },
        });
        return res.status(200).send({ content: response.data });
      } catch {
        return res.status(502).send({ error: "Failed to fetch URL" });
      }
    });
  }
}
