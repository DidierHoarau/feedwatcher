import { Database } from "sqlite3";
import { Config } from "../Config";
import * as fs from "fs-extra";
import { Logger } from "../utils-std-ts/Logger";
import { Span } from "@opentelemetry/sdk-trace-base";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

const logger = new Logger("SqlDbutils");
const SQL_DIR = `${__dirname}/../../sql`;

let database;

export class SqlDbutils {
  //
  public static async init(context: Span, config: Config): Promise<void> {
    const span = StandardTracer.startSpan("SqlDbutils_init", context);
    await fs.ensureDir(config.DATA_DIR);
    database = new Database(`${config.DATA_DIR}/database.db`);
    await SqlDbutils.execSQL(span, (await fs.readFile(`${SQL_DIR}/init-0000.sql`)).toString());
    const initFiles = (await await fs.readdir(`${SQL_DIR}`)).sort();
    let dbVersionApplied = 0;
    const dbVersionQuery = await SqlDbutils.querySQL(
      span,
      "SELECT MAX(value) as maxVerion FROM metadata WHERE type='db_version'"
    );
    if (dbVersionQuery[0].maxVerion) {
      dbVersionApplied = Number(dbVersionQuery[0].maxVerion);
    }
    logger.info(`Current DB Version: ${dbVersionApplied}`);
    for (const initFile of initFiles) {
      const regex = /init-(\d+).sql/g;
      const match = regex.exec(initFile);
      if (match) {
        const dbVersionInitFile = Number(match[1]);
        if (dbVersionInitFile > dbVersionApplied) {
          logger.info(`Loading init file: ${initFile}`);
          SqlDbutils.execSQL(span, (await fs.readFile(`${SQL_DIR}/${initFile}`)).toString());
          await SqlDbutils.querySQL(span, 'INSERT INTO metadata (type, value, dateCreated) VALUES ("db_version",?,?)', [
            dbVersionInitFile,
            new Date().toISOString(),
          ]);
        }
      }
    }
    span.end();
  }

  public static async execSQL(context: Span, sql: string, params = []): Promise<void> {
    const span = StandardTracer.startSpan("SqlDbutils_execSQL", context);
    await database.run(sql, params);
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async querySQL(context: Span, sql: string, params = []): Promise<any[]> {
    const span = StandardTracer.startSpan("SqlDbutils_querySQL", context);
    return new Promise((resolve, reject) => {
      database.all(sql, params, (error, rows) => {
        span.end();
        if (error) {
          reject(error);
        } else {
          resolve(rows);
        }
      });
    });
  }
}
