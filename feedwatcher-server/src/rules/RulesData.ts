import { Span } from "@opentelemetry/sdk-trace-base";
import { Rules } from "../model/Rules";
import { StandardTracerStartSpan } from "../utils-std-ts/StandardTracer";
import { SqlDbUtilsExecSQL, SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

//
export async function RulesDataGet(context: Span, ruleId: string): Promise<Rules> {
  const span = StandardTracerStartSpan("RulesData_get", context);
  const rulesRaw = await SqlDbUtilsQuerySQL(span, "SELECT * FROM rules WHERE id = ?", [ruleId]);
  let rules: Rules = new Rules();
  if (rulesRaw.length > 0) {
    rules = fromRaw(rulesRaw[0]);
  }
  span.end();
  return rules;
}

export async function RulesDataListForUser(context: Span, userId: string): Promise<Rules> {
  const span = StandardTracerStartSpan("RulesDataListForUser", context);
  const rulesRaw = await SqlDbUtilsQuerySQL(span, `SELECT * FROM rules WHERE userId = '${userId}'`);
  let rules = new Rules();
  rules.userId = userId;
  for (const userRules of rulesRaw) {
    rules = fromRaw(userRules);
  }
  span.end();
  return rules;
}

export async function RulesDataListAll(context: Span): Promise<Rules[]> {
  const span = StandardTracerStartSpan("RulesDataListAll", context);
  const rulesRaw = await SqlDbUtilsQuerySQL(span, `SELECT * FROM rules`);
  const rules = [];
  for (const userRules of rulesRaw) {
    rules.push(fromRaw(userRules));
  }
  span.end();
  return rules;
}

export async function RulesDataUpdate(context: Span, rules: Rules): Promise<void> {
  const span = StandardTracerStartSpan("RulesDataUpdate", context);
  await SqlDbUtilsExecSQL(span, "DELETE FROM rules WHERE userId = ?", [rules.userId]);
  await SqlDbUtilsExecSQL(span, "INSERT INTO rules (id,userId,info) VALUES (?,?,?)", [
    rules.id,
    rules.userId,
    JSON.stringify(rules.info),
  ]);
  span.end();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRaw(rulesRaw: any): Rules {
  const rules = new Rules();
  rules.id = rulesRaw.id;
  rules.userId = rulesRaw.userId;
  rules.info = JSON.parse(rulesRaw.info);
  return rules;
}
