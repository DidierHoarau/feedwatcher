import { SourceItem } from "./SourceItem";

export class SearchItemsResult {
  //
  public sourceItems: SourceItem[];
  public pageHasMore: boolean;
  public nextCursor: { datePublished: string; id: string } | null;

  constructor() {
    this.sourceItems = [];
    this.pageHasMore = false;
    this.nextCursor = null;
  }
}
