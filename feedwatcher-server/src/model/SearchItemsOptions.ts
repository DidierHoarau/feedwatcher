import { SourceItemStatus } from "./SourceItemStatus";

export class SearchItemsOptions {
  //
  public cursor?: { datePublished: string; id: string };
  public maxDate?: Date;
  public minDate?: Date;
  public filterStatus?: SourceItemStatus;
  public isSaved?: boolean;
  public pattern?: string;
}
