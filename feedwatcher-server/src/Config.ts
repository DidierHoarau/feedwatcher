import * as fse from "fs-extra";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "./utils-std-ts/Logger";
import { ConfigInterface } from "./utils-std-ts/models/ConfigInterface";

const logger = new Logger("config");

export class Config implements ConfigInterface {
  //
  public readonly CONFIG_FILE: string = "config.json";
  public readonly SERVICE_ID = "feedwatcher-server";
  public VERSION = 1;
  public readonly API_PORT: number = 8080;
  public JWT_VALIDITY_DURATION: number = 3 * 31 * 24 * 3600;
  public CORS_POLICY_ORIGIN: string;
  public DATA_DIR = process.env.DATA_DIR || "/data";
  public JWT_KEY: string = uuidv4();
  public LOG_LEVEL = "info";
  public SOURCE_FETCH_FREQUENCY = 30 * 60 * 1000;
  public OPENTELEMETRY_COLLECTOR_HTTP_TRACES: string =
    process.env.OPENTELEMETRY_COLLECTOR_HTTP_TRACES || "";
  public OPENTELEMETRY_COLLECTOR_HTTP_METRICS: string =
    process.env.OPENTELEMETRY_COLLECTOR_HTTP_METRICS || "";
  public OPENTELEMETRY_COLLECTOR_HTTP_LOGS: string =
    process.env.OPENTELEMETRY_COLLECTOR_HTTP_LOGS || "";
  public OPENTELEMETRY_COLLECTOR_EXPORT_LOGS_INTERVAL_SECONDS = 60;
  public OPENTELEMETRY_COLLECTOR_EXPORT_METRICS_INTERVAL_SECONDS = 120;
  public OPENTELEMETRY_COLLECTOR_AWS =
    process.env.OPENTELEMETRY_COLLECTOR_AWS === "true";
  public OPENTELEMETRY_COLLECTOR_CONSOLE = false;
  public PROCESSORS_SYSTEM = "processors-system";
  public PROCESSORS_USER = "processors-user";

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
    setIfSet("JWT_VALIDITY_DURATION");
    setIfSet("CORS_POLICY_ORIGIN");
    setIfSet("DATA_DIR");
    setIfSet("JWT_KEY", false);
    setIfSet("LOG_LEVEL");
    setIfSet("SOURCE_FETCH_FREQUENCY");
    setIfSet("OPENTELEMETRY_COLLECTOR_HTTP_TRACES");
    setIfSet("OPENTELEMETRY_COLLECTOR_HTTP_METRICS");
    setIfSet("OPENTELEMETRY_COLLECTOR_HTTP_LOGS");
    setIfSet("OPENTELEMETRY_COLLECTOR_EXPORT_LOGS_INTERVAL_SECONDS");
    setIfSet("OPENTELEMETRY_COLLECTOR_EXPORT_METRICS_INTERVAL_SECONDS");
    setIfSet("OPENTELEMETRY_COLLECTOR_AWS");
    setIfSet("OPENTELEMETRY_COLLECTOR_CONSOLE");
  }
}
