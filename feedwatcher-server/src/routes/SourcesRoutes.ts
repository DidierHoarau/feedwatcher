import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourcesData } from "../data/SourcesData";
import { Source } from "../model/Source";
import { Processors } from "../procesors/processors";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class SourcesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sources = await SourcesData.listForUser(StandardTracer.getSpanFromRequest(req), userSession.userId);
      return res.status(200).send({ sources });
    });

    interface PostSource extends RequestGenericInterface {
      Body: {
        url: string;
      };
    }
    fastify.post<PostSource>("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const source = new Source();
      source.name = req.body.url;
      source.info = { url: req.body.url };
      source.userId = userSession.userId;
      await Processors.checkSource(StandardTracer.getSpanFromRequest(req), source);
      if (!source.info.processorPath) {
        return res.status(400).send({ error: "Source Not Supported (No Processor Matching)" });
      }
      await SourcesData.add(StandardTracer.getSpanFromRequest(req), source);
      Processors.fetchSourceItems(StandardTracer.getSpanFromRequest(req), source);
      return res.status(201).send(source.toJson());
    });

    fastify.put<PostSource>("/fetch", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      Processors.fetchSourceItemsForUser(StandardTracer.getSpanFromRequest(req), userSession.userId);
      return res.status(201).send({});
    });
  }
}
