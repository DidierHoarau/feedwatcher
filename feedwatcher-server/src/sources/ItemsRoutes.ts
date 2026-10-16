import { FastifyInstance, RequestGenericInterface } from "fastify";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { SourcesDataGet } from "./SourcesData";
import {
  SearchItemsDataListForSource,
  SearchItemsDataListForUser,
  SearchItemsDataListItemsForLabel,
} from "./SearchItemsData";
import {
  SourceItemsDataGetForUser,
  SourceItemsDataUpdateMultipleStatusForUser,
} from "./SourceItemsData";
import {
  ItemTagsDataGetForItem,
  ItemTagsDataListForUser,
  ItemTagsDataSetForItem,
} from "./ItemTagsData";
import { AuthGetUserSession } from "../users/Auth";
import { OTelRequestSpan } from "../OTelContext";
import { UrlSafetyError } from "../utils-std-ts/UrlSafety";
import { ItemReaderExtract } from "./ItemReader";

export class ItemsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetItemIdRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.get<GetItemIdRequest>("/:itemId", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItem = await SourceItemsDataGetForUser(
        OTelRequestSpan(req),
        req.params.itemId,
        userSession.userId,
      );
      if (!sourceItem) {
        return res.status(404).send({ error: "Item Not Found" });
      }
      sourceItem.tags = await ItemTagsDataGetForItem(
        OTelRequestSpan(req),
        req.params.itemId,
        userSession.userId,
      );
      return res.status(200).send(sourceItem);
    });

    fastify.get("/tags", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const tags = await ItemTagsDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      return res.status(200).send({ tags });
    });

    interface GetItemIdTagsRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
    }
    fastify.get<GetItemIdTagsRequest>("/:itemId/tags", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItem = await SourceItemsDataGetForUser(
        OTelRequestSpan(req),
        req.params.itemId,
        userSession.userId,
      );
      if (!sourceItem) {
        return res.status(404).send({ error: "Item Not Found" });
      }
      const tags = await ItemTagsDataGetForItem(
        OTelRequestSpan(req),
        req.params.itemId,
        userSession.userId,
      );
      return res.status(200).send({ tags });
    });

    interface PutItemIdTagsRequest extends RequestGenericInterface {
      Params: {
        itemId: string;
      };
      Body: {
        tags: string[];
      };
    }
    const tagsBodySchema = {
      type: "object",
      required: ["tags"],
      properties: {
        tags: {
          type: "array",
          maxItems: 50,
          items: { type: "string", maxLength: 200 },
        },
      },
    };
    fastify.put<PutItemIdTagsRequest>(
      "/:itemId/tags",
      { schema: { body: tagsBodySchema } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const sourceItem = await SourceItemsDataGetForUser(
          OTelRequestSpan(req),
          req.params.itemId,
          userSession.userId,
        );
        if (!sourceItem) {
          return res.status(404).send({ error: "Item Not Found" });
        }
        await ItemTagsDataSetForItem(
          OTelRequestSpan(req),
          req.params.itemId,
          userSession.userId,
          req.body.tags,
        );
        const tags = await ItemTagsDataGetForItem(
          OTelRequestSpan(req),
          req.params.itemId,
          userSession.userId,
        );
        return res.status(200).send({ tags });
      },
    );

    interface PostSourceItemsSearchRequest extends RequestGenericInterface {
      Body: {
        searchCriteria: string;
        cursor: { datePublished: string; id: string; rank?: number };
        filterStatus: SourceItemStatus;
        labelName: string;
        sourceId: string;
        isSaved: boolean;
        sinceDate: string;
        untilDate: string;
        pattern: string;
        sort: string;
        tagName: string;
      };
    }

    const searchBodySchema = {
      type: "object",
      required: ["searchCriteria"],
      properties: {
        searchCriteria: {
          type: "string",
          enum: ["labelName", "sourceId", "all"],
        },
        cursor: {
          type: "object",
          required: ["datePublished", "id"],
          properties: {
            datePublished: { type: "string", format: "date-time" },
            id: { type: "string", minLength: 1 },
            rank: { type: "number" },
          },
        },
        filterStatus: { type: "string", enum: ["read", "unread", "all"] },
        labelName: { type: "string" },
        sourceId: { type: "string" },
        isSaved: { type: "boolean" },
        sinceDate: { type: "string", format: "date-time" },
        untilDate: { type: "string", format: "date-time" },
        pattern: { type: "string" },
        sort: { type: "string", enum: ["date_desc", "date_asc", "relevance"] },
        tagName: { type: "string" },
      },
    };

    fastify.post<PostSourceItemsSearchRequest>(
      "/search",
      { schema: { body: searchBodySchema } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }

        if (req.body.searchCriteria === "labelName" && !req.body.labelName) {
          return res
            .status(400)
            .send({ error: "Missing Parameter: labelName" });
        }

        if (req.body.searchCriteria === "sourceId" && !req.body.sourceId) {
          return res
            .status(400)
            .send({ error: "Missing Parameter: sourceId" });
        }

        const searchOptions = new SearchItemsOptions();
        if (req.body.cursor) {
          searchOptions.cursor = req.body.cursor;
        }
        searchOptions.filterStatus =
          req.body.filterStatus || SourceItemStatus.unread;
        searchOptions.isSaved = req.body.isSaved ? true : false;
        if (req.body.sinceDate) {
          searchOptions.minDate = new Date(req.body.sinceDate);
        }
        if (req.body.untilDate) {
          searchOptions.maxDate = new Date(req.body.untilDate);
        }
        if (req.body.pattern) {
          searchOptions.pattern = req.body.pattern;
        }
        if (req.body.sort) {
          searchOptions.sort = req.body.sort as SearchItemsOptions["sort"];
        }
        if (req.body.tagName) {
          searchOptions.tagName = req.body.tagName;
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
          if (!source) {
            return res.status(404).send({ error: "Source Not Found" });
          }
          if (source.userId !== userSession.userId) {
            return res.status(403).send({ error: "Access Denied" });
          }
          const searchItemsResult = await SearchItemsDataListForSource(
            OTelRequestSpan(req),
            source.id,
            userSession.userId,
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
      },
    );

    interface PutSourceItemIdStatusRequest extends RequestGenericInterface {
      Body: {
        itemIds: string[];
        status: SourceItemStatus;
      };
    }
    const statusBodySchema = {
      type: "object",
      required: ["status", "itemIds"],
      properties: {
        status: { type: "string", enum: ["read", "unread"] },
        itemIds: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
      },
    };
    fastify.put<PutSourceItemIdStatusRequest>(
      "/status",
      { schema: { body: statusBodySchema } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }

        await SourceItemsDataUpdateMultipleStatusForUser(
          OTelRequestSpan(req),
          req.body.itemIds,
          req.body.status,
          userSession.userId,
        );
        return res.status(200).send({});
      },
    );

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
      if (!req.body?.url || !String(req.body.url).trim()) {
        return res.status(400).send({ error: "Invalid URL" });
      }
      try {
        const extracted = await ItemReaderExtract(String(req.body.url));
        return res.status(200).send(extracted);
      } catch (err) {
        if (err instanceof UrlSafetyError) {
          return res.status(err.statusCode).send({ error: err.message });
        }
        return res.status(502).send({ error: "Failed to fetch URL" });
      }
    });
  }
}
