import { Span } from "@opentelemetry/sdk-trace-base";
import * as cron from "node-cron";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Logger } from "../utils-std-ts/Logger";
import { TasksData } from "../data/TasksData";
import { TaskExecutionsData } from "../data/TaskExecutionsData";

const logger = new Logger("data/scheduler");

export class Scheduler {
  //
  constructor(taskData: TasksData, taskExecutionsData: TaskExecutionsData) {
    this.tasksData = taskData;
    this.taskExecutionsData = taskExecutionsData;
  }

  private tasksData: TasksData;
  private taskExecutionsData: TaskExecutionsData;
  private scheduledCrons: any[] = [];

  public async calculate(context: Span): Promise<void> {
    const span = StandardTracer.startSpan("Scheduler_calculate", context);
    logger.info("Re-calculating schedules");
    for (const scheduledCron of this.scheduledCrons) {
      scheduledCron.destroy();
    }
    this.scheduledCrons = [];
    const tasks = await this.tasksData.list(context);
    for (const task of tasks) {
      if (task.schedule) {
        logger.info(`Scheduling task ${task.id}: ${task.schedule}`);
        const newScheduleCron = cron.schedule(task.schedule, () => {
          this.execute(span, task.id);
        });
        this.scheduledCrons.push(newScheduleCron);
      }
    }
    span.end();
  }

  private async execute(context: Span, taskId: string): Promise<void> {
    const span = StandardTracer.startSpan("Scheduler_execute", context);
    const task = await this.tasksData.get(span, taskId);
    logger.info(`Schedule reached for ${task.id}`);
    this.taskExecutionsData.createFromTaskId(span, taskId);
    span.end();
  }
}
