import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { StandardTracerStartSpan } from "./utils-std-ts/StandardTracer";
import { TimeoutWait } from "./utils-std-ts/Timeout";
import { RulesDataListAll } from "./rules/RulesData";
import { ProcessorsFetchSourceItems } from "./procesors/Processors";
import { SourcesDataListAll } from "./sources/SourcesData";
import { RulesExecutionExecuteUserRules } from "./rules/RulesExecution";
import { SourceItemsDataCleanupOrphans } from "./sources/SourceItemsData";
import { PromisePool } from "./utils-std-ts/PromisePool";

let config: Config;

export async function SchedulerInit(context: Span, configIn: Config) {
  const span = StandardTracerStartSpan("SchedulerInit", context);
  config = configIn;
  SchedulerStartSchedule();
  span.end();
}

// Private Functions

async function SchedulerStartSchedule() {
  const promisePool = new PromisePool(5, config.SOURCE_FETCH_FREQUENCY / 6);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const span0 = StandardTracerStartSpan("SchedulerStartSchedule");
    for (const source of await SourcesDataListAll(span0)) {
      if (
        !source.info.dateFetched ||
        new Date().getTime() - new Date(source.info.dateFetched).getTime() > config.SOURCE_FETCH_FREQUENCY
      ) {
        promisePool.add(async () => {
          const span = StandardTracerStartSpan("SchedulerStartSchedule");
          await ProcessorsFetchSourceItems(span, source);
          span.end();
        });
      }
    }

    for (const userRules of await RulesDataListAll(span0)) {
      promisePool.add(async () => {
        const span = StandardTracerStartSpan("SchedulerStartSchedule");
        return RulesExecutionExecuteUserRules(span, userRules);
        span.end();
      });
    }

    promisePool.add(async () => {
      const span = StandardTracerStartSpan("SchedulerStartSchedule");
      await SourceItemsDataCleanupOrphans(span);
      span.end();
    });
    span0.end();

    await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
  }
}
