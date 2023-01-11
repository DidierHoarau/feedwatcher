import * as fse from "fs-extra";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "./utils-std-ts/Logger";
import { ConfigInterface } from "./utils-std-ts/models/ConfigInterface";

const logger = new Logger("config");

export class Config implements ConfigInterface {
  //
  public readonly CONFIG_FILE: string = process.env.TELEPATHY_CONFIG || "";
  public readonly SERVICE_ID = "telepathy-server";
  public VERSION = 1;
  public readonly API_PORT: number = 8080;
  public AGENT_REGISTRATION_DURATION: number = 30 * 60;
  public JWT_VALIDITY_DURATION: number = 7 * 24 * 3600;
  public CORS_POLICY_ORIGIN: string;
  public DATA_DIR = ".";
  public AGENT_KEY: string = uuidv4();
  public JWT_KEY: string = uuidv4();
  public LOG_LEVEL = "info";
  public TASK_HISTORY_MAX_COUNT = 100;
  public TASK_HISTORY_MAX_AGE_DAYS = 30;
  public TASK_ALIVE_TIMEOUT = 100;
  public FILE_REDUNDANCY = 2;
  public OPENTELEMETRY_COLLECTOR_HTTP: string;
  public OPENTELEMETRY_COLLECTOR_AWS = false;

  public async reload(): Promise<void> {
    const content = await fse.readJson(this.CONFIG_FILE);
    const setIfSet = (field: string, displayLog = true) => {
      if (content[field]) {
        this[field] = content[field];
      }
      if (displayLog) {
        logger.info(`Configuration Value: ${field}: ${this[field]}`);
      } else {
        logger.info(`Configuration Value: ${field}: ********************`);
      }
    };
    logger.info(`Configuration Value: CONFIG_FILE: ${this.CONFIG_FILE}`);
    logger.info(`Configuration Value: VERSION: ${this.VERSION}`);
    setIfSet("AGENT_REGISTRATION_DURATION");
    setIfSet("JWT_VALIDITY_DURATION");
    setIfSet("CORS_POLICY_ORIGIN");
    setIfSet("DATA_DIR");
    setIfSet("TASK_HISTORY_MAX_COUNT");
    setIfSet("TASK_HISTORY_MAX_AGE_DAYS");
    setIfSet("AGENT_KEY", false);
    setIfSet("JWT_KEY", false);
    setIfSet("TASK_ALIVE_TIMEOUT");
    setIfSet("LOG_LEVEL");
    setIfSet("FILE_REDUNDANCY");
    setIfSet("OPENTELEMETRY_COLLECTOR_HTTP");
    setIfSet("OPENTELEMETRY_COLLECTOR_AWS");
  }
}
