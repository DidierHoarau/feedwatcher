import { v4 as uuidv4 } from "uuid";

export class Rules {
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static fromJson(json: any): Rules {
    if (!json) {
      return null;
    }
    const rules = new Rules();
    if (json.id) {
      rules.id = json.id;
    }
    rules.id = json.id;
    if (typeof json.info === "string") {
      rules.info = JSON.parse(json.info);
    } else {
      rules.info = json.info;
    }
    return rules;
  }

  public id: string;
  public userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public info: any;

  constructor() {
    this.id = uuidv4();
    this.info = [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public toJson(): any {
    return {
      id: this.id,
      userId: this.userId,
      info: this.info,
    };
  }
}
