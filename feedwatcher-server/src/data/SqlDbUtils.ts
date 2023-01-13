import { Database } from "sqlite3";
import { Config } from "../Config";
import * as fs from "fs-extra";
import { Logger } from "../utils-std-ts/Logger";

const logger = new Logger("SqlDbutils");
let database;

export class SqlDbutils {
  //
  public static async init(config: Config): Promise<void> {
    database = new Database(`${config.DATA_DIR}/database.db`);
    await SqlDbutils.execSQL(
      (await fs.readFile(`${__dirname}/sql/init-0000.sql`)).toString()
    );
    const initFiles = (await await fs.readdir(`${__dirname}/sql`)).sort();
    let dbVersionApplied = 0;
    const dbVersionQuery = await SqlDbutils.querySQL(
      "SELECT MAX(value) as maxVerion FROM metadata WHERE type='db_version'"
    );
    if (dbVersionQuery[0].maxVerion) {
      dbVersionApplied = dbVersionQuery[0].maxVerion;
    }
    for (let initFile of initFiles) {
      const regex = /init-(\d+).sql/g;
      const match = regex.exec(initFile);
      if (match) {
        const dbVersionInitFile = Number(match[1]);
        if (dbVersionInitFile > dbVersionApplied) {
          logger.info(`Loading init file: ${initFile}`);
          SqlDbutils.execSQL(
            (await fs.readFile(`${__dirname}/sql/${initFile}`)).toString()
          );
        }
      }
    }
  }

  public static async execSQL(sql: string): Promise<void> {
    await database.exec(sql);
  }

  // @ts-ignore
  public static async querySQL(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      database.all(sql, function (error, rows) {
        if (error) {
          reject(error);
        } else {
          resolve(rows);
        }
      });
    });
  }
}
