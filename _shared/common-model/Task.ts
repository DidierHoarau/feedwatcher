import { v4 as uuidv4 } from "uuid";
import { TaskOutputDefinition } from "./TaskOutputDefinition";

export class Task {
  //
  public static fromJson(json: any): Task {
    if (!json) {
      return null;
    }
    const task = new Task();
    if (json.id) {
      task.id = json.id;
    }
    if (json.tag) {
      task.tag = json.tag;
    }
    if (json.outputDefinitions) {
      task.outputDefinitions = json.outputDefinitions;
    }
    task.name = json.name;
    task.script = json.script;
    task.schedule = json.schedule;
    task.webhook = json.webhook;

    return task;
  }

  public id: string;
  public name: string;
  public script: string;
  public schedule: string;
  public tag: string;
  public webhook: string;
  public outputDefinitions: TaskOutputDefinition[];

  constructor() {
    this.id = uuidv4();
    this.outputDefinitions = [];
  }

  public toJson(): any {
    return {
      id: this.id,
      name: this.name,
      script: this.script,
      schedule: this.schedule,
      tag: this.tag,
      outputDefinitions: this.outputDefinitions,
      webhook: this.webhook,
    };
  }
}
