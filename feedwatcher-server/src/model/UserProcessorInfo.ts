import { UserProcessorInfoStatus } from "./UserProcessorInfoStatus";

export interface UserProcessorInfo {
  userId: string;
  lastUpdate?: Date;
  status: UserProcessorInfoStatus;
}
