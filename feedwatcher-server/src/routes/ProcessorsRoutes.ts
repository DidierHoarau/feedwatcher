import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { Processors } from "../procesors/processors";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ProcessorsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      res.status(200).send(await Processors.getInfos(StandardTracer.getSpanFromRequest(req)));
    });

    fastify.get("/status", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      res.status(200).send(Processors.getUserProcessorInfo(StandardTracer.getSpanFromRequest(req), userSession.userId));
    });
  }
}
