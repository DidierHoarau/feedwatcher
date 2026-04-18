import Database from "better-sqlite3";
import { Config } from "../Config";
import * as fs from "fs-extra";
import { Span } from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import { OTelLogger, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("SqlDbutils");
const SQL_DIR = `${__dirname}/../../sql`;

let database: Database.Database;

export async function SqlDbUtilsInit(
  context: Span,
  config: Config,
): Promise<void> {
  const span = OTelTracer().startSpan("SqlDbUtilsInit", context);
  await fs.ensureDir(config.DATA_DIR);
  database = new Database(`${config.DATA_DIR}/database.db`);
  SqlDbUtilsExecSQLFile(span, `${SQL_DIR}/init-0000.sql`);
  const initFiles = (await fs.readdir(`${SQL_DIR}`)).sort();
  let dbVersionApplied = 0;
  const dbVersionQuery = SqlDbUtilsQuerySQL(
    span,
    "SELECT MAX(value) as maxVerion FROM metadata WHERE type='db_version'",
  );
  if (dbVersionQuery[0].maxVerion) {
    dbVersionApplied = Number(dbVersionQuery[0].maxVerion);
  }
  logger.info(`Current DB Version: ${dbVersionApplied}`, span);
  for (const initFile of initFiles) {
    const regex = /init-(\d+).sql/g;
    const match = regex.exec(initFile);
    if (match) {
      const dbVersionInitFile = Number(match[1]);
      if (dbVersionInitFile > dbVersionApplied) {
        logger.info(`Loading init file: ${initFile}`, span);
        SqlDbUtilsExecSQLFile(span, `${SQL_DIR}/${initFile}`);
        SqlDbUtilsExecSQL(
          span,
          "INSERT INTO metadata (type, value, dateCreated) VALUES ('db_version',?,?)",
          [dbVersionInitFile, new Date().toISOString()],
        );
      }
    }
  }
  span.end();
}

export function SqlDbUtilsInitGetDatabase() {
  return database;
}

export function SqlDbUtilsExecSQL(
  context: Span,
  sql: string,
  params = [],
): number {
  const span = OTelTracer().startSpan("SqlDbUtilsExecSQL", context);
  try {
    const stmt = database.prepare(sql);
    const result = stmt.run(params);
    span.addEvent(`Impacted Rows: ${result.changes}`);
    span.end();
    return result.changes;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    throw error;
  }
}

export function SqlDbUtilsExecSQLFile(context: Span, filename: string): void {
  const span = OTelTracer().startSpan("SqlDbUtilsExecSQLFile", context);
  try {
    const sql = fs.readFileSync(filename).toString();
    database.exec(sql);
    span.end();
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    throw error;
  }
}

export function SqlDbUtilsQuerySQL(
  context: Span,
  sql: string,
  params = [],
  debug = false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  const span = OTelTracer().startSpan("SqlDbUtilsQuerySQL", context);
  if (debug) {
    console.log(sql);
  }
  try {
    const stmt = database.prepare(sql);
    const rows = stmt.all(params);
    span.end();
    return rows;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    throw error;
  }
}
