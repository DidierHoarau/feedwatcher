import { SourceItem } from "./SourceItem";

export class SearchItemsResult {
  //
  public sourceItems: SourceItem[];
  public pageHasMore: boolean;

  constructor() {
    this.sourceItems = [];
    this.pageHasMore = false;
  }
}
