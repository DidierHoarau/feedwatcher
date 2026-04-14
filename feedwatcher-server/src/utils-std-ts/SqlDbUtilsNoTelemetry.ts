import { OTelLogger } from "../OTelContext";
import { SqlDbUtilsInitGetDatabase } from "./SqlDbUtils";

const logger = OTelLogger().createModuleLogger("SqlDbUtilsNoTelemetry");

export function SqlDbUtilsNoTelemetryExecSQL(sql: string, params = []): void {
  try {
    const stmt = SqlDbUtilsInitGetDatabase().prepare(sql);
    stmt.run(params);
  } catch (error) {
    throw error;
  }
}

export function SqlDbUtilsNoTelemetryQuerySQL(
  sql: string,
  params = [],
  debug = false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  if (debug) {
    console.log(sql);
  }
  try {
    const stmt = SqlDbUtilsInitGetDatabase().prepare(sql);
    return stmt.all(params);
  } catch (error) {
    logger.error(`SQL ERROR: ${sql}`, error);
    throw error;
  }
}
