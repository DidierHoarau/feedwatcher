import { Span } from "@opentelemetry/sdk-trace-base";
import { Logger } from "../utils-std-ts/Logger";
import { Rules } from "../model/Rules";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

const logger = new Logger("RulesExecution");

export async function RulesExecutionExecuteUserRules(context: Span, rules: Rules): Promise<void> {
  const span = StandardTracerStartSpan("RulesExecutionExecuteUserRules", context);

  for (const ruleInfo of rules.info) {
    if (ruleInfo.autoRead) {
      for (const rulePattern of ruleInfo.autoRead) {
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
          await execRuleForSource(span, RuleAction.archive, ruleInfo.sourceId, {
            maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
          });
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
          await execRuleForSource(span, RuleAction.delete, ruleInfo.sourceId, {
            maxDate: new Date(new Date().getTime() - rulePattern.ageDays * 24 * 3600 * 1000),
          });
        }
      }
    }
  }
  logger.info(`Rules for user ${rules.userId} executed`);
  span.end();
}

// Private Fucntions

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
  const span = StandardTracerStartSpan("execRuleForUser", context);
  await SqlDbUtilsQuerySQL(
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
  const span = StandardTracerStartSpan("execRuleForSource", context);
  await SqlDbUtilsQuerySQL(
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
  const span = StandardTracerStartSpan("execRuleForLabel", context);
  await SqlDbUtilsQuerySQL(
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
    return ` AND sources_items.title GLOB '${searchOptions.pattern.replace(/'/g, "''")}' `;
  }
  return "";
}
