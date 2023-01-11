import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { TaskExecutionStatus } from "../common-model/TaskExecutionStatus";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Logger } from "../utils-std-ts/Logger";
import { Timeout } from "../utils-std-ts/Timeout";
import { Config } from "../Config";
import { TaskExecutionsData } from "../data/TaskExecutionsData";
import { TasksData } from "../data/TasksData";

const logger = new Logger("data/taskCleanup");

export class TaskCleanup {
  //
  constructor(config: Config, tasksData: TasksData, taskExecutionsData: TaskExecutionsData) {
    this.config = config;
    this.taskExecutionsData = taskExecutionsData;
    this.tasksData = tasksData;
  }

  private config: Config;
  private tasksData: TasksData;
  private taskExecutionsData: TaskExecutionsData;

  public async startMaintenance(): Promise<void> {
    const span = StandardTracer.startSpan("TaskCleanup_startMaintenance");
    logger.info("Start Task execution maintenance");
    await this.cleanByDate(span).catch((error) => {
      logger.error(error);
    });
    await this.cleanByCount(span).catch((error) => {
      logger.error(error);
    });
    span.end();
    await Timeout.wait(1000 * 60 * 60);
    this.startMaintenance();
  }

  public async monitorTimeouts(): Promise<void> {
    const span = StandardTracer.startSpan("TaskCleanup_monitorTimeouts");
    await this.cleanTimedOut(span).catch((error) => {
      logger.error(error);
    });
    span.end();
    await Timeout.wait(this.config.TASK_ALIVE_TIMEOUT * 1000);
    this.monitorTimeouts();
  }

  private async cleanByDate(context: Span): Promise<void> {
    const span = StandardTracer.startSpan("TaskCleanup_cleanByDate", context);
    const taskExecutions = await this.taskExecutionsData.list(span);
    for (const taskExecution of taskExecutions) {
      if (!taskExecution.dateQueued) {
        logger.info(`Clean task execution: ${taskExecution.id}`);
        await this.taskExecutionsData.delete(span, taskExecution.id);
      }
      const taskAge = (new Date().getTime() - new Date(taskExecution.dateQueued).getTime()) / (1000 * 60 * 60 * 24);
      if (taskAge > this.config.TASK_HISTORY_MAX_AGE_DAYS) {
        logger.info(`Clean task execution: ${taskExecution.id}`);
        await this.taskExecutionsData.delete(span, taskExecution.id);
      }
    }
    span.end();
  }

  private async cleanByCount(context: Span): Promise<void> {
    const span = StandardTracer.startSpan("TaskCleanup_cleanByCount", context);
    const taskExecutions = await this.taskExecutionsData.list(span);
    const tasks = await this.tasksData.list(span);
    for (const task of tasks) {
      const currentTaskExecutions = _.sortBy(_.filter(taskExecutions, { taskId: task.id }), "dateQueued");
      if (currentTaskExecutions.length > this.config.TASK_HISTORY_MAX_COUNT) {
        const nbToDelete = currentTaskExecutions.length - this.config.TASK_HISTORY_MAX_COUNT;
        logger.info(`Task ${task.id} as ${currentTaskExecutions.length} execution (${nbToDelete} to delete)`);
        for (let i = 0; i < nbToDelete; i++) {
          logger.info(`Clean task execution: ${currentTaskExecutions[i].id}`);
          await this.taskExecutionsData.delete(span, currentTaskExecutions[i].id);
        }
      }
    }
    span.end();
  }

  private async cleanTimedOut(context: Span): Promise<void> {
    const span = StandardTracer.startSpan("TaskCleanup_cleanTimedOut", context);
    const taskExecutions = await this.taskExecutionsData.list(span);
    for (const taskExecution of taskExecutions) {
      if (
        taskExecution.version > 1 &&
        (taskExecution.status === TaskExecutionStatus.executing ||
          taskExecution.status === TaskExecutionStatus.cancelling) &&
        (!taskExecution.dateAgentAlive ||
          (new Date().getTime() - new Date(taskExecution.dateAgentAlive).getTime()) / 1000 >
            this.config.TASK_ALIVE_TIMEOUT)
      ) {
        logger.info(`Task Execution Timed Out: ${taskExecution.taskId}/${taskExecution.id}`);
        taskExecution.status = TaskExecutionStatus.failed;
        await this.taskExecutionsData.update(span, taskExecution.id, taskExecution);
      }
    }
    span.end();
  }
}
