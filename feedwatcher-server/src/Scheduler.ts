import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { SourceItemsData } from "./sources/SourceItemsData";
import { RulesExecution } from "./rules/RulesExecution";
import { StandardTracerStartSpan } from "./utils-std-ts/StandardTracer";
import { TimeoutWait } from "./utils-std-ts/Timeout";
import { RulesDataListAll } from "./rules/RulesData";
import { ProcessorsFetchSourceItems } from "./procesors/Processors";
import { SourcesDataListAll } from "./sources/SourcesData";

let config: Config;

export async function SchedulerInit(context: Span, configIn: Config) {
  const span = StandardTracerStartSpan("SchedulerInit", context);
  config = configIn;
  SchedulerStartSchedule();
  span.end();
}

// Private Functions

async function SchedulerStartSchedule() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const span = StandardTracerStartSpan("SchedulerStartSchedule");
    const sources = await SourcesDataListAll(span);
    for (const source of sources) {
      if (
        !source.info.dateFetched ||
        new Date().getTime() - new Date(source.info.dateFetched).getTime() > config.SOURCE_FETCH_FREQUENCY
      ) {
        await ProcessorsFetchSourceItems(span, source);
      }
    }

    for (const userRules of await RulesDataListAll(span)) {
      await RulesExecution.executeUserRules(span, userRules);
    }

    await SourceItemsData.cleanupOrphans(span);

    span.end();
    await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
  }
}
