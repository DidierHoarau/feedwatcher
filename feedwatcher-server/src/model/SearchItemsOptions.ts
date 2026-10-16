import { SourceItemStatus } from "./SourceItemStatus";

export class SearchItemsOptions {
  //
  public cursor?: { datePublished: string; id: string; rank?: number };
  public maxDate?: Date;
  public minDate?: Date;
  public filterStatus?: SourceItemStatus;
  public isSaved?: boolean;
  public pattern?: string;
  public sort?: "date_desc" | "date_asc" | "relevance";
  public tagName?: string;
}
