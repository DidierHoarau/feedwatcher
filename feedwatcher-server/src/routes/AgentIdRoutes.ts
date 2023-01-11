import * as _ from "lodash";
import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { Agent } from "../common-model/Agent";
import { User } from "../common-model/User";
import { TaskExecutionStatus } from "../common-model/TaskExecutionStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { AgentsData } from "../data/AgentsData";
import { Config } from "../Config";
import { TaskExecutionsData } from "../data/TaskExecutionsData";

let agentData: AgentsData;
let config: Config;
let taskExecutionsData: TaskExecutionsData;

export class AgentIdRoutes {
  //
  constructor(configIn: Config, agentDataIn: AgentsData, taskExecutionsDataIn: TaskExecutionsData) {
    agentData = agentDataIn;
    config = configIn;
    taskExecutionsData = taskExecutionsDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PostSession extends RequestGenericInterface {
      Body: {
        key: string;
        tags: string[];
      };
      Params: {
        agentId: string;
      };
    }
    fastify.post<PostSession>("/session", async (req, res) => {
      if (!req.body.key) {
        return res.status(400).send({ error: "Missing: Key" });
      } else if (req.body.key !== config.AGENT_KEY) {
        return res.status(403).send({ error: "Access Denied" });
      } else {
        const agent = new Agent(req.params.agentId);
        if (req.body.tags) {
          agent.tags = req.body.tags;
        }
        await agentData.register(StandardTracer.getSpanFromRequest(req), agent);
        const userAgent = new User();
        userAgent.name = req.params.agentId;
        res.status(201).send({ success: true, token: await Auth.generateJWT(userAgent) });
      }
    });

    interface GetTaskExecutions extends RequestGenericInterface {
      Params: {
        agentId: string;
      };
    }
    fastify.get<GetTaskExecutions>("/tasks/executions", async (req, res) => {
      await Auth.mustBeAuthenticated(req, res);
      const taskExecutionsQueued = _.filter(await taskExecutionsData.list(StandardTracer.getSpanFromRequest(req)), {
        status: TaskExecutionStatus.queued,
      });
      const agent = await agentData.get(StandardTracer.getSpanFromRequest(req), req.params.agentId);
      const taskExecutionCompatible = [];
      for (const taskExecution of taskExecutionsQueued) {
        if (!taskExecution.tag || agent.tags.indexOf(taskExecution.tag) >= 0) {
          taskExecutionCompatible.push(taskExecution);
        }
      }
      res.status(201).send({
        agent_registered: true,
        task_executions: taskExecutionCompatible,
      });
    });
  }
}
