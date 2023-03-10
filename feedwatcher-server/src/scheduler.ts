import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { Timeout } from "./utils-std-ts/Timeout";
import { Processors } from "./procesors/processors";
import { SourcesData } from "./data/SourcesData";
import { SourceItemsData } from "./data/SourceItemsData";

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
      const sources = await SourcesData.listAll(span);
      for (const source of sources) {
        if (
          !source.info.dateFetched ||
          new Date().getTime() - new Date(source.info.dateFetched).getTime() > config.SOURCE_FETCH_FREQUENCY
        ) {
          await Processors.fetchSourceItems(span, source);
        }
      }
      await SourceItemsData.cleanupOrphans(span);
      span.end();
      await Timeout.wait(config.SOURCE_FETCH_FREQUENCY / 4);
    }
  }
}
