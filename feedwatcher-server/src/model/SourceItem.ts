import { v4 as uuidv4 } from "uuid";
import { SourceItemStatus } from "./SourceItemStatus";

export class SourceItem {
  //
  public id: string;
  public sourceId: string;
  public title: string;
  public datePublished: Date;
  public content: string;
  public url: string;
  public status: SourceItemStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public info: any;

  constructor() {
    this.id = uuidv4();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static fromRaw(itemRaw: any): SourceItem {
    const sourceItem = new SourceItem();
    sourceItem.id = itemRaw.id;
    sourceItem.sourceId = itemRaw.sourceId;
    sourceItem.title = itemRaw.title;
    sourceItem.content = itemRaw.content;
    sourceItem.url = itemRaw.url;
    sourceItem.status = itemRaw.status;
    sourceItem.datePublished = new Date(itemRaw.datePublished);
    sourceItem.info = JSON.parse(itemRaw.info);
    return sourceItem;
  }
}
