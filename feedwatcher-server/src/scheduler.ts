import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { SourceItemsData } from "./data/SourceItemsData";
import { SourcesData } from "./data/SourcesData";
import { SourceItemStatus } from "./model/SourceItemStatus";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { Timeout } from "./utils-std-ts/Timeout";
import * as fs from "fs-extra";
import * as path from "path";
import { Source } from "./model/Source";
import { SourceItem } from "./model/SourceItem";
import { v4 as uuidv4 } from "uuid";
import { Processor } from "./processor";

let config: Config;

export class Scheduler {
  //
  public static async init(context: Span, configIn: Config) {
    const span = StandardTracer.startSpan("Scheduler_init", context);
    config = configIn;
    Scheduler.startSchedule();
    span.end();
  }

  public static async startSchedule() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const span = StandardTracer.startSpan("Scheduler_start");
      await Processor.fetchSourceItemsAll(span);
      span.end();
      await Timeout.wait(config.SOURCE_FETCH_FREQUENCY);
    }
  }
}
