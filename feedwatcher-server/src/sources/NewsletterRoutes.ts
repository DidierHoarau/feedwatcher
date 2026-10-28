import { FastifyInstance, RequestGenericInterface } from "fastify";
import { DbUtilsWithLock } from "@devopsplaybook.io/common-utils";
import { ConfigGet } from "../Config";
import { Source } from "../model/Source";
import { OTelLogger, OTelRequestSpan } from "../OTelContext";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
} from "../procesors/Processors";
import { AuthGetUserSession } from "../users/Auth";
import { UsersDataGet } from "../users/UsersData";
import { PromisePool } from "../utils-std-ts/PromisePool";
import {
  NEWSLETTER_PROVIDER,
  NewsletterError,
  NewsletterFeed,
  NewsletterGetFeeds,
} from "./NewsletterClient";
import {
  newsletterCatalogueStates,
  newsletterFindSourceIds,
} from "./NewsletterMatching";
import {
  NewsletterBackfillProviders,
  NewsletterRepairProviderSources,
} from "./NewsletterProvider";
import { SourceLabelsDataSetSourceLabels } from "./SourceLabelsData";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";

const logger = OTelLogger().createModuleLogger("NewsletterRoutes");

const DEFAULT_LABEL = "Newsletters";
const MAX_SUBSCRIBE_FEED_IDS = 100;
const MAX_FEED_ID_CHARS = 128;
const MAX_LABEL_CHARS = 200;
const MAX_PROCESSOR_CONCURRENCY = 3;
const PROCESSOR_CHECK_TIMEOUT_MS = 15000;
const FIRST_FETCH_TIMEOUT_MS = 30000;

interface SubscribeBody {
  feedIds: string[];
  label?: string;
  includeIgnored?: boolean;
}

interface CatalogueQuery {
  refresh?: string;
}

let firstFetchPool: PromisePool = null;
let firstFetchPoolConcurrency = 0;

// First item fetches stay in the background like POST /api/sources, but share
// one bounded pool so a burst of subscriptions cannot open many fetches.
function getFirstFetchPool(concurrency: number): PromisePool {
  if (!firstFetchPool || firstFetchPoolConcurrency !== concurrency) {
    firstFetchPool = new PromisePool(concurrency, FIRST_FETCH_TIMEOUT_MS);
    firstFetchPoolConcurrency = concurrency;
  }
  return firstFetchPool;
}

function processorConcurrency(): number {
  const configured = Number(ConfigGet().PROCESSOR_CONCURRENCY);
  if (!Number.isFinite(configured) || configured < 1) {
    return 1;
  }
  return Math.min(Math.floor(configured), MAX_PROCESSOR_CONCURRENCY);
}

function parseFeedIds(input: any): string[] | null {
  if (!Array.isArray(input) || input.length < 1) {
    return null;
  }
  if (input.length > MAX_SUBSCRIBE_FEED_IDS) {
    return null;
  }
  const feedIds: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return null;
    }
    const feedId = raw.trim();
    if (feedId === "" || feedId.length > MAX_FEED_ID_CHARS) {
      return null;
    }
    if (!feedIds.includes(feedId)) {
      feedIds.push(feedId);
    }
  }
  return feedIds;
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function parseLabel(input: any): string | null {
  if (input === undefined || input === null) {
    return DEFAULT_LABEL;
  }
  if (typeof input !== "string") {
    return null;
  }
  const label = input.trim();
  if (label.length > MAX_LABEL_CHARS || hasControlChars(label)) {
    return null;
  }
  return label === "" ? DEFAULT_LABEL : label;
}

function parseIncludeIgnored(input: any): boolean | null {
  if (input === undefined) {
    return false;
  }
  if (typeof input !== "boolean") {
    return null;
  }
  return input;
}

export class NewsletterRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    interface GetCatalogue extends RequestGenericInterface {
      Querystring: CatalogueQuery;
    }
    fastify.get<GetCatalogue>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const config = ConfigGet();
      if (!String(config.NEWSLETTER_URL ?? "").trim()) {
        return res.status(200).send({ enabled: false, feeds: [] });
      }
      const refresh = req.query?.refresh;
      const force = refresh === "1" || refresh === "true";
      let feeds: NewsletterFeed[];
      try {
        feeds = await NewsletterGetFeeds({ force });
      } catch (err) {
        if (err instanceof NewsletterError) {
          return res
            .status(err.statusCode)
            .send({ error: err.message, code: err.code });
        }
        throw err;
      }
      const sources = await SourcesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const user = await UsersDataGet(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const catalogueFeedIds = new Set(
        feeds.map((feed) => feed.providerFeedId),
      );
      const sourceIdsByFeedId = newsletterFindSourceIds(
        sources,
        catalogueFeedIds,
      );
      const ignoredFeedIds = new Set<string>(
        user?.settings?.newsletter?.ignoredFeedIds ?? [],
      );
      return res.status(200).send({
        enabled: true,
        feeds: newsletterCatalogueStates(
          feeds,
          sourceIdsByFeedId,
          ignoredFeedIds,
        ),
      });
    });

    interface PostSubscribe extends RequestGenericInterface {
      Body: SubscribeBody;
    }
    fastify.post<PostSubscribe>("/subscribe", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const body: any = req.body || {};
      const feedIds = parseFeedIds(body.feedIds);
      if (!feedIds) {
        return res.status(400).send({ error: "Missing or invalid: feedIds" });
      }
      const label = parseLabel(body.label);
      if (label === null) {
        return res.status(400).send({ error: "Invalid: label" });
      }
      const includeIgnored = parseIncludeIgnored(body.includeIgnored);
      if (includeIgnored === null) {
        return res.status(400).send({ error: "Invalid: includeIgnored" });
      }
      const config = ConfigGet();
      if (!String(config.NEWSLETTER_URL ?? "").trim()) {
        return res.status(503).send({
          error: "The newsletter integration is not configured.",
          code: "newsletter_disabled",
        });
      }

      // Resolve every feed id against the current catalogue server-side: any
      // URL or name supplied by the browser is ignored.
      let catalogue: NewsletterFeed[];
      try {
        catalogue = await NewsletterGetFeeds({ force: true });
      } catch (err) {
        if (err instanceof NewsletterError) {
          return res
            .status(err.statusCode)
            .send({ error: err.message, code: err.code });
        }
        throw err;
      }
      const catalogueByFeedId = new Map(
        catalogue.map((feed) => [feed.providerFeedId, feed]),
      );

      const sources = await SourcesDataListForUser(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const user = await UsersDataGet(
        OTelRequestSpan(req),
        userSession.userId,
      );
      const ignoredFeedIds = new Set<string>(
        user?.settings?.newsletter?.ignoredFeedIds ?? [],
      );
      const requestedFeedIds = new Set(feedIds);
      const sourceIdsByFeedId = newsletterFindSourceIds(
        sources,
        requestedFeedIds,
      );

      const added: { feedId: string; sourceId: string }[] = [];
      const existing: { feedId: string; sourceId: string }[] = [];
      const failed: { feedId: string; error: string }[] = [];
      const ignored: string[] = [];
      const candidates: { seed: Source; feedId: string }[] = [];

      for (const feedId of feedIds) {
        const matchedSourceId = sourceIdsByFeedId.get(feedId);
        if (matchedSourceId) {
          existing.push({ feedId, sourceId: matchedSourceId });
          continue;
        }
        const feed = catalogueByFeedId.get(feedId);
        if (!feed) {
          failed.push({
            feedId,
            error: "This feed is not offered by the newsletter service.",
          });
          continue;
        }
        if (ignoredFeedIds.has(feedId) && includeIgnored !== true) {
          ignored.push(feedId);
          continue;
        }
        const source = new Source();
        source.userId = userSession.userId;
        source.name = feed.title || feedId;
        source.info = {
          url: feed.feedUrl,
          provider: NEWSLETTER_PROVIDER,
          providerFeedId: feedId,
          providerUrl: feed.feedUrl,
        };
        candidates.push({ seed: source, feedId });
      }

      // Processor detection fetches each feed: run it bounded so a large
      // selection cannot open dozens of connections at once.
      const checkPool = new PromisePool(
        processorConcurrency(),
        PROCESSOR_CHECK_TIMEOUT_MS,
      );
      const checked: { source: Source; feedId: string; error: string }[] = [];
      await Promise.all(
        candidates.map(({ seed, feedId }) =>
          checkPool.add(async () => {
            const error = await ProcessorsCheckSource(
              OTelRequestSpan(req),
              seed,
            );
            checked.push({ source: seed, feedId, error });
          }),
        ),
      );

      const insertable: Source[] = [];
      for (const candidate of checked) {
        if (!candidate.source.info?.processorPath) {
          failed.push({
            feedId: candidate.feedId,
            error:
              candidate.error ||
              "No processor matched this newsletter feed.",
          });
          continue;
        }
        insertable.push(candidate.source);
      }

      // Serialize by user so concurrent retries cannot create duplicates.
      // The lock name is per-user; DbUtilsWithLock's published type only lists
      // the built-in lock names, while any name is a valid advisory lock.
      await DbUtilsWithLock(
        `newsletter-subscribe-${userSession.userId}` as any,
        async () => {
          const freshSources = await SourcesDataListForUser(
            OTelRequestSpan(req),
            userSession.userId,
          );
          const freshMatches = newsletterFindSourceIds(
            freshSources,
            requestedFeedIds,
          );
          for (const source of insertable) {
            const feedId = source.info.providerFeedId;
            const matchedSourceId = freshMatches.get(feedId);
            if (matchedSourceId) {
              existing.push({ feedId, sourceId: matchedSourceId });
              continue;
            }
            await SourcesDataAdd(OTelRequestSpan(req), source);
            await SourceLabelsDataSetSourceLabels(
              OTelRequestSpan(req),
              source.id,
              [label],
            );
            freshMatches.set(feedId, source.id);
            added.push({ feedId, sourceId: source.id });
          }
        },
      );

      const fetchPool = getFirstFetchPool(processorConcurrency());
      for (const sourceId of added.map((entry) => entry.sourceId)) {
        const source = insertable.find((entry) => entry.id === sourceId);
        if (!source) {
          continue;
        }
        fetchPool
          .add(() => ProcessorsFetchSourceItems(OTelRequestSpan(req), source))
          .catch((err) =>
            logger.error("Newsletter first fetch failed", err),
          );
      }

      return res.status(200).send({ added, existing, failed, ignored });
    });

    interface PostRepair extends RequestGenericInterface {
      Body: {
        dryRun?: boolean;
      };
    }
    fastify.post<PostRepair>("/repair", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const config = ConfigGet();
      if (!String(config.NEWSLETTER_URL ?? "").trim()) {
        return res.status(503).send({
          error: "The newsletter integration is not configured.",
          code: "newsletter_disabled",
        });
      }
      const body: any = req.body || {};
      if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
        return res.status(400).send({ error: "Invalid: dryRun" });
      }
      const dryRun = body.dryRun !== false;
      try {
        const backfill = await NewsletterBackfillProviders(
          OTelRequestSpan(req),
          { useCatalogue: true, userId: userSession.userId },
        );
        const report = await NewsletterRepairProviderSources(
          OTelRequestSpan(req),
          {
            userId: userSession.userId,
            dryRun,
            backfilled: backfill.tagged,
          },
        );
        return res.status(200).send(report);
      } catch (err) {
        if (err instanceof NewsletterError) {
          return res
            .status(err.statusCode)
            .send({ error: err.message, code: err.code });
        }
        throw err;
      }
    });
  }
}
