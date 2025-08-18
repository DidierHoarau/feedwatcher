import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { StandardTracerStartSpan } from "./utils-std-ts/StandardTracer";
import { TimeoutWait } from "./utils-std-ts/Timeout";
import { RulesDataListAll } from "./rules/RulesData";
import { ProcessorsFetchSourceItems } from "./procesors/Processors";
import {
  SourcesDataListAll,
  SourcesDataListCountsSaved,
} from "./sources/SourcesData";
import { RulesExecutionExecuteUserRules } from "./rules/RulesExecution";
import {
  SourceItemsDataCleanupOrphans,
  SourceItemsDataGetCount,
} from "./sources/SourceItemsData";
import { PromisePool } from "./utils-std-ts/PromisePool";
import { StandardMeterCreateObservableGauge } from "./utils-std-ts/StandardMeter";
import { SourceItemStatus } from "./model/SourceItemStatus";

let config: Config;
const statsSourceItms = {
  itemsTotal: 0,
  itemsRead: 0,
  itemsUnread: 0,
  itemsBookmarked: 0,
};

export async function SchedulerInit(context: Span, configIn: Config) {
  const span = StandardTracerStartSpan("SchedulerInit", context);
  config = configIn;
  await SchedulerUpdateStats(span);

  StandardMeterCreateObservableGauge(
    "feeds.items.queue",
    (observableResult) => {
      observableResult.observe(statsSourceItms.itemsUnread, { item: "unread" });
      observableResult.observe(statsSourceItms.itemsBookmarked, {
        item: "bookmarked",
      });
    },
    { description: "Items left to read" }
  );

  StandardMeterCreateObservableGauge(
    "feeds.items.total",
    (observableResult) => {
      observableResult.observe(statsSourceItms.itemsRead, { item: "read" });
      observableResult.observe(statsSourceItms.itemsTotal, {
        item: "total",
      });
    },
    { description: "Items in the database" }
  );

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
        new Date().getTime() - new Date(source.info.dateFetched).getTime() >
          config.SOURCE_FETCH_FREQUENCY
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

    await SchedulerUpdateStats(span0);

    span0.end();

    await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
  }
}

// privaae

async function SchedulerUpdateStats(context: Span) {
  const span = StandardTracerStartSpan("SchedulerUpdateStats", context);
  const nbReadItem = await SourceItemsDataGetCount(span, SourceItemStatus.read);
  const nbUnreadItem = await SourceItemsDataGetCount(
    span,
    SourceItemStatus.unread
  );
  const nbSavedItem = await SourcesDataListCountsSaved(span);
  statsSourceItms.itemsTotal = nbReadItem + nbUnreadItem;
  statsSourceItms.itemsRead = nbReadItem;
  statsSourceItms.itemsUnread = nbUnreadItem;
  statsSourceItms.itemsBookmarked = nbSavedItem;
  span.end();
}
