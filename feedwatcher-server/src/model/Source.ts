import { v4 as uuidv4 } from "uuid";

export class Source {
  //
  public id: string;
  public name: string;
  public userId: string;
  public info: any;
  public labels?: string[];

  constructor() {
    this.id = uuidv4();
    this.info = {};
  }

  public toJson(): any {
    return {
      id: this.id,
      name: this.name,
      info: this.info,
      userId: this.userId,
      labels: this.labels,
    };
  }
}
