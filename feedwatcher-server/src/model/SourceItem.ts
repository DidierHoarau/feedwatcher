import { v4 as uuidv4 } from "uuid";
import { SourceItemStatus } from "./SourceItemStatus";

export class SourceItem {
  //
  public id: string;
  public sourceId: string;
  public title: string;
  public datePublished: Date;
  public contemt: string;
  public url: string;
  public status: SourceItemStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public info: any;

  constructor() {
    this.id = uuidv4();
  }
}
