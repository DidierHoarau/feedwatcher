import { v4 as uuidv4 } from "uuid";
import { SourceItemStatus } from "./SourceItemStatus";

export class SourceItem {
  //
  public id: string;
  public sourceId: string;
  public idExternal: string;
  public title: string;
  public date: Date;
  public contemt: string;
  public userId: string;
  public url: string;
  public status: SourceItemStatus;

  constructor() {
    this.id = uuidv4();
  }
}
