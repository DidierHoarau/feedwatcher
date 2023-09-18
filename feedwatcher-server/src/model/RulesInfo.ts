import { RulesPattern } from "./RulesPattern";

export interface RulesInfo {
  //
  isRoot?: boolean;
  labelName?: string;
  sourceId?: string;
  autoRead?: RulesPattern[];
  autoDelete?: RulesPattern[];
}
