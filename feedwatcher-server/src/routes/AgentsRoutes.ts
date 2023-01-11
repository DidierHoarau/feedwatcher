import { FastifyInstance } from "fastify";
import { Auth } from "../data/Auth";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { AgentsData } from "../data/AgentsData";

let agentData: AgentsData;

export class AgentsRoutes {
  //
  constructor(agentDataIn: AgentsData) {
    agentData = agentDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      await Auth.mustBeAuthenticated(req, res);
      const agents = await agentData.list(StandardTracer.getSpanFromRequest(req));
      res.status(200).send({
        agents,
      });
    });

    fastify.get("/tags", async (req, res) => {
      const agents = await agentData.list(StandardTracer.getSpanFromRequest(req));
      const tags = [];
      for (const agent of agents) {
        for (const tag of agent.tags) {
          if (tags.indexOf(tag) < 0) {
            tags.push(tag);
          }
        }
      }
      res.status(200).send(tags);
    });
  }
}
