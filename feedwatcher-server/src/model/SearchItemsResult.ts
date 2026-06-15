import { SourceItem } from "./SourceItem";

export class SearchItemsResult {
  //
  public sourceItems: SourceItem[];
  public pageHasMore: boolean;
  public nextCursor: string;

  constructor() {
    this.sourceItems = [];
    this.pageHasMore = false;
    this.nextCursor = "";
  }
}
