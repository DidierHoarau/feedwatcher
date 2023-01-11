import * as _ from "lodash";
import { FastifyInstance, RequestGenericInterface } from "fastify";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { TaskExecutionsData } from "../data/TaskExecutionsData";
import { AgentsData } from "../data/AgentsData";
import { TasksData } from "../data/TasksData";

let taskExecutionsData: TaskExecutionsData;
let tasksData: TasksData;

export class TasksWebhooksRoutes {
  //
  constructor(taskDataIn: TasksData, taskExecutionsDataIn: TaskExecutionsData) {
    taskExecutionsData = taskExecutionsDataIn;
    tasksData = taskDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PostTaskWebhook extends RequestGenericInterface {
      Params: {
        webhookId: string;
      };
    }
    fastify.post<PostTaskWebhook>("/:webhookId", async (req, res) => {
      const tasks = await tasksData.list(StandardTracer.getSpanFromRequest(req));
      const task = _.find(tasks, {
        webhook: req.params.webhookId,
      });
      if (!task) {
        return res.status(404).send({ error: "Not Found" });
      }
      const newTaskExecution = await taskExecutionsData.createFromTaskId(
        StandardTracer.getSpanFromRequest(req),
        task.id
      );
      res.status(201).send(newTaskExecution.toJson());
    });
  }
}
