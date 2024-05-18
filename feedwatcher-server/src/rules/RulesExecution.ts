import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceItemsData } from "../sources/SourceItemsData";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { Logger } from "../utils-std-ts/Logger";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Rules } from "../model/Rules";
import { minimatch } from "minimatch";
import { SourceItem } from "../model/SourceItem";
import { RulesInfo } from "../model/RulesInfo";
import { RulesPattern } from "../model/RulesPattern";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { SqlDbutils } from "../utils-std-ts/SqlDbUtils";

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
          if (ruleInfo.isRoot) {
            if (ruleInfo.isRoot) {
              await execRuleForUser(span, RuleAction.archive, rules.userId, {
                maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
                pattern: rulePattern.pattern,
              });
            } else if (ruleInfo.labelName) {
              await execRuleForLabel(span, RuleAction.archive, ruleInfo.labelName, rules.userId, {
                maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
                pattern: rulePattern.pattern,
              });
            } else if (ruleInfo.sourceId) {
              return await execRuleForSource(span, RuleAction.archive, ruleInfo.sourceId, {
                maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
              });
            }
          }
        }
      }
      if (ruleInfo.autoDelete) {
        for (const rulePattern of ruleInfo.autoDelete) {
          if (ruleInfo.isRoot) {
            await execRuleForUser(span, RuleAction.delete, rules.userId, {
              maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
              pattern: rulePattern.pattern,
            });
          } else if (ruleInfo.labelName) {
            await execRuleForLabel(span, RuleAction.delete, ruleInfo.labelName, rules.userId, {
              maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
              pattern: rulePattern.pattern,
            });
          } else if (ruleInfo.sourceId) {
            return await execRuleForSource(span, RuleAction.delete, ruleInfo.sourceId, {
              maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
            });
          }
        }
      }
    }
    logger.info(`Rules for ${rules.userId}: ${rulesMarkRead} marked read ; ${rulesDelete} deleted`);

    span.end();
  }
}

enum RuleAction {
  delete = "delete",
  archive = "archive",
}

async function execRuleForUser(
  context: Span,
  action: RuleAction,
  userId: string,
  searchOptions: SearchItemsOptions
): Promise<void> {
  const span = StandardTracer.startSpan("RulesExecution_execRuleForUser", context);
  const sourceItemsRaw = await SqlDbutils.querySQL(
    span,
    getRuleActionSql(action) +
      "WHERE sources_items.sourceId IN ( SELECT id FROM sources WHERE userId = ? ) " +
      getAgeFilterQuery(searchOptions) +
      getPatternFilterQuery(searchOptions),
    [userId]
  );
  span.end();
}

async function execRuleForSource(
  context: Span,
  action: RuleAction,
  sourceId: string,
  searchOptions: SearchItemsOptions
): Promise<void> {
  const span = StandardTracer.startSpan("RulesExecution_execRuleForSource", context);
  const sourceItemsRaw = await SqlDbutils.querySQL(
    span,
    getRuleActionSql(action) +
      "WHERE sourceId = ? " +
      getAgeFilterQuery(searchOptions) +
      getPatternFilterQuery(searchOptions),
    [sourceId]
  );
  span.end();
}

async function execRuleForLabel(
  context: Span,
  action: RuleAction,
  label: string,
  userId: string,
  searchOptions: SearchItemsOptions
): Promise<void> {
  const span = StandardTracer.startSpan("SourceItemsData_execRuleForLabel", context);
  const sourceItemsRaw = await SqlDbutils.querySQL(
    span,
    getRuleActionSql(action) +
      "WHERE sources_items.sourceId IN ( " +
      "    SELECT sources.id " +
      "    FROM sources, sources_labels " +
      "    WHERE sources.userId = ? " +
      "          AND sources_labels.sourceId = sources.id AND sources_labels.name LIKE ? " +
      "  ) " +
      getAgeFilterQuery(searchOptions) +
      getPatternFilterQuery(searchOptions),
    [userId, `${label}%`]
  );
  span.end();
}

function getRuleActionSql(ruleAction: RuleAction): string {
  if (ruleAction == RuleAction.delete) {
    return " DELETE FROM sources_items ";
  }
  return ' UPDATE sources_items SET status = "read" ';
}

function getAgeFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.maxDate) {
    return ` AND sources_items.datePublished <= '${searchOptions.maxDate.toISOString()}' `;
  }
  return "";
}

function getPatternFilterQuery(searchOptions: SearchItemsOptions): string {
  if (searchOptions.pattern) {
    return ` AND sources_items.title GLOB '${searchOptions.pattern}' `;
  }
  return "";
}
