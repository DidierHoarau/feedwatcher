import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItemsData } from "../sources/SourceItemsData";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { Logger } from "../utils-std-ts/Logger";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Rules } from "../model/Rules";
import { SearchItemsData } from "../sources/SearchItemsData";
import { minimatch } from "minimatch";
import { SourceItem } from "../model/SourceItem";
import { RulesInfo } from "../model/RulesInfo";
import { RulesPattern } from "../model/RulesPattern";

const logger = new Logger("RulesExecution");

export class RulesExecution {
  //
  public static async executeUserRules(context: Span, rules: Rules): Promise<void> {
    const span = StandardTracer.startSpan("RulesExecution_executeUserRules", context);

    let rulesMarkRead = 0;
    let rulesDelete = 0;
    for (const ruleInfo of rules.info) {
      if (ruleInfo.autoRead) {
        for (const rulePattern of ruleInfo.autoRead) {
          const itemList = await RulesExecution.getTargetItemList(
            span,
            rules.userId,
            ruleInfo,
            rulePattern,
            SourceItemStatus.unread
          );
          for (const item of itemList) {
            if (minimatch(item.title, `*${rulePattern.pattern}*`)) {
              await SourceItemsData.updateMultipleStatusForUser(span, [item.id], SourceItemStatus.read, rules.userId);
              rulesMarkRead++;
            }
          }
        }
      }
      if (ruleInfo.autoDelete) {
        for (const rulePattern of ruleInfo.autoDelete) {
          const itemList = await RulesExecution.getTargetItemList(span, rules.userId, ruleInfo, rulePattern);
          for (const item of itemList) {
            if (minimatch(item.title, rulePattern.pattern)) {
              await SourceItemsData.delete(span, rules.userId, item.id);
              rulesDelete++;
            }
          }
        }
      }
    }
    logger.info(`Rules for ${rules.userId}: ${rulesMarkRead} marked read ; ${rulesDelete} deleted`);

    span.end();
  }

  private static async getTargetItemList(
    context: Span,
    userId: string,
    ruleInfo: RulesInfo,
    rulePattern: RulesPattern,
    filterStatus: SourceItemStatus = SourceItemStatus.all
  ): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("RulesExecution_getTargetItemList", context);
    if (ruleInfo.isRoot) {
      return (
        await SearchItemsData.listForUser(span, userId, {
          maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
          page: -1,
          filterStatus,
        })
      ).sourceItems;
    } else if (ruleInfo.labelName) {
      return (
        await SearchItemsData.listItemsForLabel(span, ruleInfo.labelName, userId, {
          maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
          page: -1,
          filterStatus,
        })
      ).sourceItems;
    } else if (ruleInfo.sourceId) {
      return (
        await SearchItemsData.listForSource(span, ruleInfo.sourceId, {
          maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
          page: -1,
          filterStatus,
        })
      ).sourceItems;
    }
    return [];
    span.end();
  }
}
