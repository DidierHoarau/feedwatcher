import { Span } from "@opentelemetry/sdk-trace-base";
import { Rules } from "../model/Rules";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class RulesData {
  //
  public static async get(context: Span, ruleId: string): Promise<Rules> {
    const span = StandardTracer.startSpan("RulesData_get", context);
    const rulesRaw = await SqlDbutils.querySQL(span, "SELECT * FROM rules WHERE id = ?", [ruleId]);
    let rules: Rules = new Rules();
    if (rulesRaw.length > 0) {
      rules = RulesData.fromRaw(rulesRaw[0]);
    }
    span.end();
    return rules;
  }

  public static async listForUser(context: Span, userId: string): Promise<Rules> {
    const span = StandardTracer.startSpan("RulesData_listForUser", context);
    const rulesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM rules WHERE userId = '${userId}'`);
    let rules = new Rules();
    rules.userId = userId;
    for (const userRules of rulesRaw) {
      rules = RulesData.fromRaw(userRules);
    }
    span.end();
    return rules;
  }

  public static async listAll(context: Span): Promise<Rules[]> {
    const span = StandardTracer.startSpan("RulesData_listForUser", context);
    const rulesRaw = await SqlDbutils.querySQL(span, `SELECT * FROM rules`);
    const rules = [];
    for (const userRules of rulesRaw) {
      rules.push(RulesData.fromRaw(userRules));
    }
    span.end();
    return rules;
  }

  public static async update(context: Span, rules: Rules): Promise<void> {
    const span = StandardTracer.startSpan("RulesData_update", context);
    await SqlDbutils.execSQL(span, "DELETE FROM rules WHERE userId = ?", [rules.userId]);
    await SqlDbutils.execSQL(span, "INSERT INTO rules (id,userId,info) VALUES (?,?,?)", [
      rules.id,
      rules.userId,
      JSON.stringify(rules.info),
    ]);
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(rulesRaw: any): Rules {
    const rules = new Rules();
    rules.id = rulesRaw.id;
    rules.userId = rulesRaw.userId;
    rules.info = JSON.parse(rulesRaw.info);
    return rules;
  }
}
