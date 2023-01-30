import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourcesData } from "../data/SourcesData";
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

    interface PutSourceIdRequest extends RequestGenericInterface {
      Params: {
        sourceId: string;
      };
      Body: {
        name: string;
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
  }
}
