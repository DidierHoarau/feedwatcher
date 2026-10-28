import { FastifyInstance, RequestGenericInterface } from "fastify";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
} from "../procesors/Processors";
import {
  SourcesDataDelete,
  SourcesDataGet,
  SourcesDataListForUser,
  SourcesDataUpdate,
} from "./SourcesData";
import {
  SourceLabelsDataGetSourceLabels,
  SourceLabelsDataSetSourceLabels,
} from "./SourceLabelsData";
import { normalizeSourceUrl } from "./SourceUrl";
import {
  NewsletterMatchExistingSourceByUrl,
  NewsletterResolveProviderForUrl,
} from "./NewsletterProvider";
import { AuthGetUserSession } from "../users/Auth";
import { OTelLogger, OTelRequestSpan } from "../OTelContext";
import { SourceGetHealth } from "../model/SourceHealth";
import { ConfigGet } from "../Config";

const logger = OTelLogger().createModuleLogger("SourcesIdRoutes");

export class SourcesIdRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetSourceIdRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.get<GetSourceIdRequest>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesDataGet(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      if (!source) {
        return res.status(404).send({ error: "Source Not Found" });
      }
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const config = ConfigGet();
      const sourceJson = source.toJson();
      sourceJson.health = SourceGetHealth(
        source.info,
        config.SOURCE_STALE_THRESHOLD,
        config.SOURCE_ERROR_THRESHOLD,
      );
      return res.status(200).send(sourceJson);
    });

    interface GetSourceIdLabelsRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.get<GetSourceIdLabelsRequest>("/labels", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesDataGet(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      if (!source) {
        return res.status(404).send({ error: "Source Not Found" });
      }
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const labels = await SourceLabelsDataGetSourceLabels(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      return res.status(200).send({ labels: labels });
    });

    interface PutSourceIdRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
      Body: {
        name: string;
        labels: string[];
        url?: string;
      };
    }
    fastify.put<PutSourceIdRequest>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesDataGet(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      if (!source) {
        return res.status(404).send({ error: "Source Not Found" });
      }
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body.name) {
        return res.status(400).send({ error: "Parameter missing: name" });
      }
      if (req.body.url !== undefined) {
        const url = String(req.body.url).trim();
        if (!url) {
          return res.status(400).send({ error: "Missing: url" });
        }
        if (normalizeSourceUrl(url) !== normalizeSourceUrl(source.info?.url)) {
          const providerMeta = await NewsletterResolveProviderForUrl(url);
          const existingSources = await SourcesDataListForUser(
            OTelRequestSpan(req),
            userSession.userId,
          );
          const duplicate = NewsletterMatchExistingSourceByUrl(
            existingSources.filter((existing) => existing.id !== source.id),
            url,
            providerMeta,
          );
          if (duplicate) {
            return res.status(409).send({ error: "Source Already Exists" });
          }
          source.info.url = url;
          if (providerMeta) {
            source.info.provider = providerMeta.provider;
            source.info.providerFeedId = providerMeta.providerFeedId;
            source.info.providerUrl = providerMeta.providerUrl;
          } else {
            delete source.info.provider;
            delete source.info.providerFeedId;
            delete source.info.providerUrl;
          }
          // The processor must be re-detected against the new URL and the
          // fetch/health state of the old URL is no longer meaningful.
          delete source.info.processorPath;
          delete source.info.dateFetched;
          delete source.info.lastItemDate;
          delete source.info.lastFetchError;
          delete source.info.lastFetchErrorDate;
          delete source.info.lastFetchErrorStatus;
          delete source.info.lastFetchErrorClass;
          delete source.info.fetchErrorCount;
          delete source.info.autoDisabled;
          delete source.info.autoDisabledDate;
          delete source.info.autoDisabledReason;
          delete source.info.retryAfterUntil;
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
        }
      }
      // ProcessorsCheckSource overwrites the name with the processor-provided
      // title: the user-provided name wins on a URL update.
      source.name = req.body.name;
      await SourcesDataUpdate(OTelRequestSpan(req), source);
      if (Array.isArray(req.body.labels)) {
        await SourceLabelsDataSetSourceLabels(
          OTelRequestSpan(req),
          source.id,
          req.body.labels,
        );
      }
      ProcessorsCheckSource(OTelRequestSpan(req), source)
        .then(() => ProcessorsFetchSourceItems(OTelRequestSpan(req), source))
        .catch((err) =>
          logger.error(`Error refreshing source ${source.id}`, err),
        );
      return res.status(200).send();
    });

    interface DeleteSourceIdRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.delete<DeleteSourceIdRequest>("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesDataGet(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      if (!source) {
        return res.status(404).send({ error: "Source Not Found" });
      }
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      await SourcesDataDelete(OTelRequestSpan(req), req.params.sourceId);
      return res.status(204).send();
    });

    interface PutSourceIdFetchRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.put<PutSourceIdFetchRequest>("/fetch", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesDataGet(
        OTelRequestSpan(req),
        req.params.sourceId,
      );
      if (!source) {
        return res.status(404).send({ error: "Source Not Found" });
      }
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      ProcessorsFetchSourceItems(OTelRequestSpan(req), source).catch((err) =>
        logger.error(`Error fetching source ${source.id}`, err),
      );
      return res.status(200).send();
    });
  }
}
