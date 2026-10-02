import { Span } from "@opentelemetry/sdk-trace-base";
import { Rules } from "../model/Rules";
import { SearchItemsOptions } from "../model/SearchItemsOptions";
import { DbUtilsExecSQL } from "@devopsplaybook.io/common-utils";
import { OTelLogger, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("RulesExecution");

export async function RulesExecutionExecuteUserRules(
  context: Span,
  rules: Rules,
): Promise<void> {
  const span = OTelTracer().startSpan(
    "RulesExecutionExecuteUserRules",
    context,
  );
  try {
    // Defensive: a stored row with a non-array info (e.g. written before
    // request validation) must never break the scheduler cycle.
    if (!Array.isArray(rules?.info)) {
      logger.warn(
        `Rules for user ${rules?.userId} are invalid (info is not an array), skipping`,
        span,
      );
      return;
    }
    for (const ruleInfo of rules.info) {
      try {
        await executeRuleInfo(span, rules.userId, ruleInfo);
      } catch (err) {
        logger.error(`Rule for user ${rules.userId} failed`, err, span);
      }
    }
    logger.info(`Rules for user ${rules.userId} executed`, span);
  } finally {
    span.end();
  }
}

// Private Fucntions

enum RuleAction {
  delete = "delete",
  archive = "archive",
}

async function executeRuleInfo(
  context: Span,
  userId: string,
  ruleInfo: any,
): Promise<void> {
  const actions = [
    { patterns: ruleInfo?.autoRead, action: RuleAction.archive },
    { patterns: ruleInfo?.autoDelete, action: RuleAction.delete },
  ];
  for (const { patterns, action } of actions) {
    if (!Array.isArray(patterns)) {
      continue;
    }
    for (const rulePattern of patterns) {
      const maxDate = rulePatternMaxDate(rulePattern);
      if (!maxDate) {
        logger.warn(
          `Skipping rule with invalid ageDays: ${JSON.stringify(rulePattern)}`,
          context,
        );
        continue;
      }
      if (ruleInfo.isRoot) {
        await execRuleForUser(context, action, userId, {
          maxDate,
          pattern: rulePattern.pattern,
        });
      } else if (ruleInfo.labelName) {
        await execRuleForLabel(context, action, ruleInfo.labelName, userId, {
          maxDate,
          pattern: rulePattern.pattern,
        });
      } else if (ruleInfo.sourceId) {
        await execRuleForSource(context, action, ruleInfo.sourceId, {
          maxDate,
        });
      }
    }
  }
}

function rulePatternMaxDate(rulePattern: any): Date {
  const ageDays = Number(rulePattern?.ageDays);
  if (!isFinite(ageDays) || ageDays < 0) {
    return null;
  }
  return new Date(Date.now() - ageDays * 24 * 3600 * 1000);
}

async function execRuleForUser(
  context: Span,
  action: RuleAction,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<void> {
  const span = OTelTracer().startSpan("execRuleForUser", context);
  const filters = getFilters(searchOptions);
  await DbUtilsExecSQL(
    span,
    getRuleActionSql(action) +
      "WHERE sources_items.sourceId IN ( SELECT id FROM sources WHERE userId = ? ) " +
      filters.query,
    [userId, ...filters.params],
  );
  span.end();
}

async function execRuleForSource(
  context: Span,
  action: RuleAction,
  sourceId: string,
  searchOptions: SearchItemsOptions,
): Promise<void> {
  const span = OTelTracer().startSpan("execRuleForSource", context);
  const filters = getFilters(searchOptions);
  await DbUtilsExecSQL(
    span,
    getRuleActionSql(action) + "WHERE sourceId = ? " + filters.query,
    [sourceId, ...filters.params],
  );
  span.end();
}

async function execRuleForLabel(
  context: Span,
  action: RuleAction,
  label: string,
  userId: string,
  searchOptions: SearchItemsOptions,
): Promise<void> {
  const span = OTelTracer().startSpan("execRuleForLabel", context);
  const filters = getFilters(searchOptions);
  await DbUtilsExecSQL(
    span,
    getRuleActionSql(action) +
      "WHERE sources_items.sourceId IN ( " +
      "    SELECT sources.id " +
      "    FROM sources, sources_labels " +
      "    WHERE sources.userId = ? " +
      "          AND sources_labels.sourceId = sources.id AND sources_labels.name LIKE ? " +
      "  ) " +
      filters.query,
    [userId, `${label}%`, ...filters.params],
  );
  span.end();
}

function getRuleActionSql(ruleAction: RuleAction): string {
  if (ruleAction == RuleAction.delete) {
    return " DELETE FROM sources_items ";
  }
  return " UPDATE sources_items SET status = 'read' ";
}

function getFilters(searchOptions: SearchItemsOptions): {
  query: string;
  params: string[];
} {
  let query = "";
  const params: string[] = [];
  if (searchOptions.maxDate) {
    query += " AND sources_items.datePublished <= ? ";
    params.push(searchOptions.maxDate.toISOString());
  }
  if (searchOptions.pattern) {
    query += " AND sources_items.title GLOB ? ";
    params.push(searchOptions.pattern);
  }
  return { query, params };
}
