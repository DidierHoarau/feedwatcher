import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourcesData } from "../data/SourcesData";
import { Source } from "../model/Source";
import { Processor } from "../processor";
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
      return res.status(201).send({ sources });
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
      await SourcesData.add(StandardTracer.getSpanFromRequest(req), source);
      Processor.checkSource(StandardTracer.getSpanFromRequest(req), source);
      return res.status(201).send(source.toJson());
    });
  }
}
