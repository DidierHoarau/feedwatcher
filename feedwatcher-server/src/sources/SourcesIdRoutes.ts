import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../users/Auth";
import { SourceLabelsData } from "../sources/SourceLabelsData";
import { SourcesData } from "../sources/SourcesData";
import { Processors } from "../procesors/Processors";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

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
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      return res.status(200).send(source);
    });

    interface GetSourceIdLabelsRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.get<GetSourceIdLabelsRequest>("/labels", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const labels = await SourceLabelsData.getSourceLabels(
        StandardTracer.getSpanFromRequest(req),
        req.params.sourceId
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
      };
    }
    fastify.put<PutSourceIdRequest>("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body.name) {
        return res.status(401).send({ error: "Parameter missing: name" });
      }
      source.name = req.body.name;
      await SourcesData.update(StandardTracer.getSpanFromRequest(req), source);
      if (req.body.labels && req.body.labels.length > 0) {
        await SourceLabelsData.setSourceLabels(StandardTracer.getSpanFromRequest(req), source.id, req.body.labels);
      }
      Processors.checkSource(StandardTracer.getSpanFromRequest(req), source).then(() => {
        Processors.fetchSourceItems(StandardTracer.getSpanFromRequest(req), source);
      });
      return res.status(202).send();
    });

    interface DeleteSourceIdRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.delete<DeleteSourceIdRequest>("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      await SourcesData.delete(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      return res.status(203).send();
    });

    interface PutSourceIdFetchRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
    }
    fastify.put<PutSourceIdFetchRequest>("/fetch", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = await SourcesData.get(StandardTracer.getSpanFromRequest(req), req.params.sourceId);
      if (userSession.userId !== source.userId) {
        return res.status(403).send({ error: "Access Denied" });
      }
      Processors.fetchSourceItems(StandardTracer.getSpanFromRequest(req), source);
      return res.status(201).send();
    });
  }
}
