import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Task } from "../common-model/Task";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { FileDBUtils } from "./FileDbUtils";

export class TasksData {
  //
  public tasks: Task[];

  public async load(context: Span): Promise<void> {
    this.tasks = await FileDBUtils.load(context, "tasks", []);
  }

  public async get(context: Span, id: string): Promise<Task> {
    return Task.fromJson(
      _.find(this.tasks, {
        id,
      })
    );
  }

  public async update(context: Span, id: string, taskUpdate: Task): Promise<void> {
    const span = StandardTracer.startSpan("Tasks_update", context);
    const task = _.find(this.tasks, {
      id,
    }) as Task;
    task.name = taskUpdate.name;
    task.script = taskUpdate.script;
    task.schedule = taskUpdate.schedule;
    task.tag = taskUpdate.tag;
    task.webhook = taskUpdate.webhook;
    task.outputDefinitions = taskUpdate.outputDefinitions;
    await this.save(span);
    span.end();
  }

  public async delete(context: Span, id: string): Promise<void> {
    const span = StandardTracer.startSpan("Tasks_delete", context);
    const position = _.findIndex(this.tasks, {
      id,
    });
    if (position >= 0) {
      this.tasks.splice(position, 1);
    }
    await this.save(span);
    span.end();
  }

  public async list(context: Span): Promise<Task[]> {
    return _.cloneDeep(this.tasks);
  }

  public async add(context: Span, task: Task): Promise<void> {
    this.tasks.push(task);
    await this.save(context);
  }

  public async save(context: Span): Promise<void> {
    await FileDBUtils.save(context, "tasks", this.tasks);
  }
}
