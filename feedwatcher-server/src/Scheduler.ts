import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { SourcesData } from "./sources/SourcesData";
import { SourceItemsData } from "./sources/SourceItemsData";
import { RulesData } from "./rules/RulesData";
import { RulesExecution } from "./rules/RulesExecution";
import { Processors } from "./procesors/Processors";
import { StandardTracerStartSpan } from "./utils-std-ts/StandardTracer";
import { TimeoutWait } from "./utils-std-ts/Timeout";

let config: Config;

export class Scheduler {
  //
  public static async init(context: Span, configIn: Config) {
    const span = StandardTracerStartSpan("Scheduler_init", context);
    config = configIn;
    Scheduler.startSchedule();
    span.end();
  }

  public static async startSchedule() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const span = StandardTracerStartSpan("Scheduler_start");
      const sources = await SourcesData.listAll(span);
      for (const source of sources) {
        if (
          !source.info.dateFetched ||
          new Date().getTime() - new Date(source.info.dateFetched).getTime() > config.SOURCE_FETCH_FREQUENCY
        ) {
          // await Processors.fetchSourceItems(span, source);
        }
      }

      for (const userRules of await RulesData.listAll(span)) {
        await RulesExecution.executeUserRules(span, userRules);
      }

      await SourceItemsData.cleanupOrphans(span);

      span.end();
      await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
    }
  }
}
