import { FastifyInstance, RequestGenericInterface } from "fastify";
import { createHash } from "crypto";
import axios from "axios";
import rateLimit from "@fastify/rate-limit";
import { Source } from "../model/Source";
import {
  OTelLogger,
  OTelRequestSpan,
  OTelTracer,
} from "../OTelContext";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
  ProcessorsFetchSourceItemsForUser,
  ProcessorsPreviewSource,
} from "../procesors/Processors";
import { AuthGetUserSession } from "../users/Auth";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";
import { SourceGetHealth } from "../model/SourceHealth";
import { ConfigGet } from "../Config";
import { UrlSafetyError, UrlSafetyFetchText } from "../utils-std-ts/UrlSafety";
import { NewsletterFetchOptionsForUrl } from "./NewsletterFetch";
import {
  NewsletterMatchExistingSourceByUrl,
  NewsletterResolveProviderForUrl,
} from "./NewsletterProvider";

const logger = OTelLogger().createModuleLogger("SourcesRoutes");

// Feeds are frequently served with generic or misconfigured content types:
// the body is parsed server-side, never rendered raw.
const FEED_FETCH_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/xml",
  "text/xml",
  "text/html",
];

const FEED_LINK_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
];

const MAX_DISCOVERED_FEEDS = 10;

// Expensive outbound endpoints: discover/preview each perform one outbound
// fetch, fetch starts a full background refresh for all of the user's sources.
export const SOURCES_DISCOVER_RATE_LIMIT = {
  max: 30,
  timeWindow: "1 minute",
};
export const SOURCES_PREVIEW_RATE_LIMIT = {
  max: 30,
  timeWindow: "1 minute",
};
export const SOURCES_FETCH_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
};

const PODCAST_INDEX_TIMEOUT_MS = 10_000;
const PODCAST_INDEX_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

interface DiscoveredFeed {
  url: string;
  title: string;
  type: string;
}

function htmlAttribute(tag: string, name: string): string {
  const match = new RegExp(
    `${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(tag);
  if (!match) {
    return "";
  }
  return (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function looksLikeFeed(body: string): boolean {
  const start = body.replace(/^\uFEFF/, "").trimStart().slice(0, 512).toLowerCase();
  return (
    start.startsWith("<?xml") ||
    start.startsWith("<rss") ||
    start.startsWith("<feed")
  );
}

function extractFeedLinks(body: string, baseUrl: string): DiscoveredFeed[] {
  const feeds = new Map<string, DiscoveredFeed>();
  for (const linkTag of body.match(/<link\b[^>]*>/gi) || []) {
    if (!/^alternate$/i.test(htmlAttribute(linkTag, "rel"))) {
      continue;
    }
    const type = htmlAttribute(linkTag, "type").toLowerCase();
    if (!FEED_LINK_TYPES.includes(type)) {
      continue;
    }
    const href = htmlAttribute(linkTag, "href");
    if (!href) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      continue;
    }
    const url = resolved.toString();
    if (feeds.has(url)) {
      continue;
    }
    feeds.set(url, {
      url,
      title: htmlAttribute(linkTag, "title"),
      type,
    });
  }
  return Array.from(feeds.values()).slice(0, MAX_DISCOVERED_FEEDS);
}

export class SourcesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    // Encapsulated limiter for this plugin only: per bearer token (a session)
    // with a per-IP fallback, so one user cannot exhaust another's bucket.
    await fastify.register(rateLimit, {
      global: false,
      keyGenerator: (req) => {
        const authorization = req.headers.authorization;
        return authorization
          ? `token:${createHash("sha256").update(authorization).digest("hex")}`
          : `ip:${req.ip}`;
      },
    });

    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sources = await SourcesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const config = ConfigGet();
      return res.status(200).send({
        sources: sources.map((source) => {
          const json = source.toJson();
          json.health = SourceGetHealth(
            source.info,
            config.SOURCE_STALE_THRESHOLD,
            config.SOURCE_ERROR_THRESHOLD,
          );
          return json;
        }),
      });
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
      if (!req.body.url || !String(req.body.url).trim()) {
        return res.status(400).send({ error: "Missing: url" });
      }
      const existingSources = await SourcesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const providerMeta = await NewsletterResolveProviderForUrl(req.body.url);
      if (
        NewsletterMatchExistingSourceByUrl(
          existingSources,
          req.body.url,
          providerMeta,
        )
      ) {
        return res.status(409).send({ error: "Source Already Exists" });
      }
      const source = new Source();
      source.name = req.body.url;
      source.info = { url: req.body.url };
      if (providerMeta) {
        source.info.provider = providerMeta.provider;
        source.info.providerFeedId = providerMeta.providerFeedId;
        source.info.providerUrl = providerMeta.providerUrl;
      }
      source.userId = userSession.userId;
      const checkError = await ProcessorsCheckSource(
        OTelRequestSpan(req),
        source,
      );
      if (!source.info.processorPath) {
        return res.status(400).send({
          error: checkError
            ? `Source Not Supported (No Processor Matching): ${checkError}`
            : "Source Not Supported (No Processor Matching)",
        });
      }
      await SourcesDataAdd(OTelRequestSpan(req), source);
      ProcessorsFetchSourceItems(OTelRequestSpan(req), source).catch((err) =>
        logger.error("Error fetching items for new source", err),
      );
      return res.status(201).send(source.toJson());
    });

    fastify.put<PostSource>(
      "/fetch",
      { config: { rateLimit: SOURCES_FETCH_RATE_LIMIT } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const span = OTelTracer().startSpan("SourcesRefreshAll");
        ProcessorsFetchSourceItemsForUser(span, userSession.userId)
          .catch((err) => logger.error("Error fetching source items", err, span))
          .finally(() => span.end());
        return res.status(200).send({});
      }
    );

    interface DiscoverQuery extends RequestGenericInterface {
      Querystring: {
        url: string;
      };
    }
    fastify.get<DiscoverQuery>(
      "/discover",
      { config: { rateLimit: SOURCES_DISCOVER_RATE_LIMIT } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }
        const requestedUrl = String(req.query.url || "").trim();
        if (!requestedUrl) {
          return res.status(400).send({ error: "Missing: url" });
        }
        let body: string;
        try {
          const providerMeta = await NewsletterResolveProviderForUrl(requestedUrl);
          body = await UrlSafetyFetchText(
            requestedUrl,
            FEED_FETCH_CONTENT_TYPES,
            NewsletterFetchOptionsForUrl(requestedUrl, providerMeta),
          );
        } catch (err: any) {
          const status =
            err instanceof UrlSafetyError ? err.statusCode : 502;
          return res
            .status(status)
            .send({ error: err?.message || "Failed to fetch URL" });
        }
        if (looksLikeFeed(body)) {
          return res
            .status(200)
            .send({ feeds: [{ url: requestedUrl, title: "", type: "" }] });
        }
        return res.status(200).send({ feeds: extractFeedLinks(body, requestedUrl) });
      }
    );

    interface PostPreview extends RequestGenericInterface {
      Body: {
        url: string;
      };
    }
    fastify.post<PostPreview>(
      "/preview",
      { config: { rateLimit: SOURCES_PREVIEW_RATE_LIMIT } },
      async (req, res) => {
        const userSession = await AuthGetUserSession(req);
        if (!userSession.isAuthenticated) {
          return res.status(403).send({ error: "Access Denied" });
        }
        if (!req.body.url || !String(req.body.url).trim()) {
          return res.status(400).send({ error: "Missing: url" });
        }
        // Transient source: only used to run processor detection + one fetch.
        const source = new Source();
        source.name = req.body.url;
        source.info = { url: req.body.url };
        const providerMeta = await NewsletterResolveProviderForUrl(req.body.url);
        if (providerMeta) {
          source.info.provider = providerMeta.provider;
          source.info.providerFeedId = providerMeta.providerFeedId;
          source.info.providerUrl = providerMeta.providerUrl;
        }
        source.userId = userSession.userId;
        const { preview, error } = await ProcessorsPreviewSource(
          OTelRequestSpan(req),
          source,
        );
        if (!preview) {
          return res.status(400).send({
            error: error
              ? `Source Not Supported (No Processor Matching): ${error}`
              : "Source Not Supported (No Processor Matching)",
          });
        }
        return res.status(200).send({
          processor: {
            title: preview.processorTitle,
            icon: preview.processorIcon,
          },
          name: preview.name,
          items: preview.items,
        });
      }
    );

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

      const config = ConfigGet();
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
            timeout: PODCAST_INDEX_TIMEOUT_MS,
            maxContentLength: PODCAST_INDEX_MAX_RESPONSE_BYTES,
            maxBodyLength: PODCAST_INDEX_MAX_RESPONSE_BYTES,
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
          }),
        );

        return res.status(200).send({ feeds });
      } catch (err: unknown) {
        const e = err as {
          code?: string;
          response?: { status?: number; data?: { description?: string } };
          message?: string;
        };
        if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
          return res
            .status(504)
            .send({ error: "Podcast Index search timed out" });
        }
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
