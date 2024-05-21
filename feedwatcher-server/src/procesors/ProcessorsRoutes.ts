import { FastifyInstance } from "fastify";
import { Auth } from "../users/Auth";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";
import { ProcessorsGetInfos, ProcessorsGetUserProcessorInfo } from "./Processors";

export class ProcessorsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      res.status(200).send(await ProcessorsGetInfos(StandardTracerGetSpanFromRequest(req)));
    });

    fastify.get("/status", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      res.status(200).send(ProcessorsGetUserProcessorInfo(StandardTracerGetSpanFromRequest(req), userSession.userId));
    });
  }
}
