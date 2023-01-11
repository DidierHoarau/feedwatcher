import { v4 as uuidv4 } from "uuid";

export class TaskOutputDefinition {
  //
  public id: string;
  public name: string;
  public pattern: string;

  constructor() {
    this.id = uuidv4();
  }
}
