export class Agent {
  //
  public id: string;
  public tags: string[];
  public lastSyncDate: Date;

  constructor(id: string) {
    this.id = id;
    this.tags = [];
  }
}
