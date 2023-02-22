import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Processors } from "../procesors/processors";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class ProcessorsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      res.status(200).send(await Processors.getInfos(StandardTracer.getSpanFromRequest(req)));
    });
  }
}
