import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { TaskExecutionStatus } from "../common-model/TaskExecutionStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { TaskExecutionsData } from "../data/TaskExecutionsData";

let taskExecutionsData: TaskExecutionsData;

export class TasksExecutionIdRoutes {
  //
  constructor(taskExecutionsDataIn: TaskExecutionsData) {
    taskExecutionsData = taskExecutionsDataIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface GetTaskExecutionRequest extends RequestGenericInterface {
      Params: {
        taskId: string;
        taskExecutionId: string;
      };
    }
    fastify.get<GetTaskExecutionRequest>("/", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const taskExecution = await taskExecutionsData.get(
        StandardTracer.getSpanFromRequest(req),
        req.params.taskExecutionId
      );
      res.status(200).send(taskExecution.toJson());
    });

    interface PostTaskExecutionCancellationRequest extends RequestGenericInterface {
      Params: {
        taskId: string;
        taskExecutionId: string;
      };
    }
    fastify.post<PostTaskExecutionCancellationRequest>("/cancellation", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const taskExecution = await taskExecutionsData.get(
        StandardTracer.getSpanFromRequest(req),
        req.params.taskExecutionId
      );
      if (taskExecution.status === TaskExecutionStatus.queued) {
        taskExecution.status = TaskExecutionStatus.cancelled;
      } else if (taskExecution.status === TaskExecutionStatus.executing) {
        taskExecution.status = TaskExecutionStatus.cancelling;
      } else {
        return res.status(403).send({ error: "Wrong Status" });
      }
      await taskExecutionsData.update(
        StandardTracer.getSpanFromRequest(req),
        req.params.taskExecutionId,
        taskExecution
      );
      res.status(202).send({});
    });

    interface GetTaskExecutionLogRequest extends RequestGenericInterface {
      Params: {
        taskId: string;
        taskExecutionId: string;
      };
    }
    fastify.get<GetTaskExecutionLogRequest>("/logs", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      const logs = await taskExecutionsData.getLogs(
        StandardTracer.getSpanFromRequest(req),
        req.params.taskExecutionId,
        req.params.taskId
      );
      res.status(200).send({ logs: logs.toString() });
    });
  }
}
