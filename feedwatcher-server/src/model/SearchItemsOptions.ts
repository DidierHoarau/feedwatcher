import { SourceItemStatus } from "./SourceItemStatus";

export class SearchItemsOptions {
  //
  public page?: number;
  public maxDate?: Date;
  public filterStatus?: SourceItemStatus;
  public isSaved?: boolean;
}
