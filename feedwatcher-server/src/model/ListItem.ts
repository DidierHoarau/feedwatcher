import { v4 as uuidv4 } from "uuid";

export class ListItem {
  //
  public id: string;
  public itemId: string;
  public userId: string;
  public name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public info: any;

  constructor() {
    this.id = uuidv4();
    this.name = "_default";
    this.info = {};
  }
}
