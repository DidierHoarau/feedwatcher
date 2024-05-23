import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Source } from "../model/Source";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";
import {
  ProcessorsCheckSource,
  ProcessorsFetchSourceItems,
  ProcessorsFetchSourceItemsForUser,
} from "../procesors/Processors";
import { SourcesDataAdd, SourcesDataListForUser } from "./SourcesData";
import { AuthGetUserSession } from "../users/Auth";

export class SourcesRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sources = await SourcesDataListForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
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
      await ProcessorsCheckSource(StandardTracerGetSpanFromRequest(req), source);
      if (!source.info.processorPath) {
        return res.status(400).send({ error: "Source Not Supported (No Processor Matching)" });
      }
      await SourcesDataAdd(StandardTracerGetSpanFromRequest(req), source);
      ProcessorsFetchSourceItems(StandardTracerGetSpanFromRequest(req), source);
      return res.status(201).send(source.toJson());
    });

    fastify.put<PostSource>("/fetch", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      ProcessorsFetchSourceItemsForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
      return res.status(201).send({});
    });
  }
}
