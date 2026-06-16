import { FastifyInstance, RequestGenericInterface } from "fastify";
import { createHash } from "crypto";
import axios from "axios";
import { Source } from "../model/Source";
import { OTelRequestSpan } from "../OTelContext";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
  ProcessorsFetchSourceItemsForUser,
} from "../procesors/Processors";
import { AuthGetUserSession } from "../users/Auth";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";
import { Config } from "../Config";

export class SourcesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sources = await SourcesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      return res.status(200).send({ sources });
    });

    interface PostSource extends RequestGenericInterface {
      Body: {
        url: string;
      };
    }
    fastify.post<PostSource>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = new Source();
      source.name = req.body.url;
      source.info = { url: req.body.url };
      source.userId = userSession.userId;
      await ProcessorsCheckSource(OTelRequestSpan(req), source);
      if (!source.info.processorPath) {
        return res
          .status(400)
          .send({ error: "Source Not Supported (No Processor Matching)" });
      }
      await SourcesDataAdd(OTelRequestSpan(req), source);
      ProcessorsFetchSourceItems(OTelRequestSpan(req), source);
      return res.status(201).send(source.toJson());
    });

    fastify.put<PostSource>("/fetch", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      ProcessorsFetchSourceItemsForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      return res.status(201).send({});
    });

    interface SearchQuery extends RequestGenericInterface {
      Querystring: {
        q: string;
      };
    }
    fastify.get<SearchQuery>("/search", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const query = req.query.q;
      if (!query || query.trim().length === 0) {
        return res.status(400).send({ error: "Missing search query" });
      }

      const config = new Config();
      await config.reload();
      const apiKey = config.PODCAST_INDEX_API_KEY;
      const apiSecret = config.PODCAST_INDEX_API_SECRET;
      if (!apiKey || !apiSecret) {
        return res.status(400).send({
          error:
            "Podcast Index API not configured. Set PODCAST_INDEX_API_KEY and PODCAST_INDEX_API_SECRET in config.",
        });
      }

      const epoch = Math.floor(Date.now() / 1000).toString();
      const hash = createHash("sha1")
        .update(apiKey + apiSecret + epoch)
        .digest("hex");

      try {
        const response = await axios.get(
          `https://api.podcastindex.org/api/1.0/search/byterm`,
          {
            params: { q: query, max: 20 },
            headers: {
              "X-Auth-Key": apiKey,
              "X-Auth-Date": epoch,
              Authorization: hash,
              "User-Agent": "FeedWatcher/1.0",
            },
          },
        );

        const feeds = (response.data.feeds || []).map(
          (f: {
            title?: string;
            url?: string;
            description?: string;
            author?: string;
            image?: string;
            artwork?: string;
          }) => ({
          title: f.title || "",
          url: f.url || "",
          description: f.description || "",
          author: f.author || "",
          image: f.image || f.artwork || "",
        }));

        return res.status(200).send({ feeds });
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { description?: string } }; message?: string };
        const status = e.response?.status || 500;
        const message =
          e.response?.data?.description ||
          e.message ||
          "Podcast Index search failed";
        return res.status(status).send({ error: message });
      }
    });
  }
}
