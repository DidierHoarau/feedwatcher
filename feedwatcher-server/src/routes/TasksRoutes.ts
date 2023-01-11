import * as cron from "node-cron";
import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { Task } from "../common-model/Task";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { TasksData } from "../data/TasksData";
import { Scheduler } from "../process/Scheduler";

let taskData: TasksData;
let scheduler: Scheduler;

export class TasksRoutes {
  //
  constructor(taskDataIn: TasksData, schedulerIn: Scheduler) {
    taskData = taskDataIn;
    scheduler = schedulerIn;
  }

  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      await Auth.mustBeAuthenticated(req, res);
      const tasks = await taskData.list(StandardTracer.getSpanFromRequest(req));
      res.status(200).send({
        tasks,
      });
    });

    interface Post extends RequestGenericInterface {
      Body: {
        name: string;
        script: string;
        schedule: string;
      };
    }
    fastify.post<Post>("/", async (req, res) => {
      Auth.mustBeAuthenticated(req, res);
      if (!req.body.name) {
        return res.status(400).send({ error: "Missing: Name" });
      }
      if (!req.body.script) {
        return res.status(400).send({ error: "Missing: Script" });
      }
      if (req.body.schedule && !cron.validate(req.body.schedule)) {
        return res.status(400).send({ error: "Invalid: Schedule" });
      }

      const newTask = Task.fromJson(req.body);
      await taskData.add(StandardTracer.getSpanFromRequest(req), newTask);
      scheduler.calculate(StandardTracer.getSpanFromRequest(req));
      res.status(201).send(newTask.toJson());
    });
  }
}
