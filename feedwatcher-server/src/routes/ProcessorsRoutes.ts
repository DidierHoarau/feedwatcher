import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Processor } from "../processor";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ProcessorsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      res.status(200).send(await Processor.getInfos(StandardTracer.getSpanFromRequest(req)));
    });
  }
}
