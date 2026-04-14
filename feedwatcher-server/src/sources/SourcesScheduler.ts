import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "../Config";
import { TimeoutWait } from "../utils-std-ts/Timeout";
import { RulesDataListAll } from "../rules/RulesData";
import { ProcessorsFetchSourceItems } from "../procesors/Processors";
import { SourcesDataListAll, SourcesDataListCountsSaved } from "./SourcesData";
import { RulesExecutionExecuteUserRules } from "../rules/RulesExecution";
import {
  SourceItemsDataCleanupOrphans,
  SourceItemsDataGetCount,
} from "./SourceItemsData";
import { PromisePool } from "../utils-std-ts/PromisePool";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { OTelLogger, OTelMeter, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("Scheduler");

let config: Config;
let lastRulesExecution = 0;

const statsSourceItms = {
  itemsTotal: 0,
  itemsRead: 0,
  itemsUnread: 0,
  itemsBookmarked: 0,
};

export async function SourcesSchedulerInit(context: Span, configIn: Config) {
  const span = OTelTracer().startSpan("SourcesSchedulerInit", context);
  config = configIn;
  await SourcesSchedulerUpdateStats(span);

  OTelMeter().createObservableGauge(
    "feeds.items.queue",
    (observableResult) => {
      observableResult.observe(statsSourceItms.itemsUnread, { item: "unread" });
      observableResult.observe(statsSourceItms.itemsBookmarked, {
        item: "bookmarked",
      });
    },
    { description: "Items left to read" },
  );

  OTelMeter().createObservableGauge(
    "feeds.items.total",
    (observableResult) => {
      observableResult.observe(statsSourceItms.itemsRead, { item: "read" });
      observableResult.observe(statsSourceItms.itemsTotal, {
        item: "total",
      });
    },
    { description: "Items in the database" },
  );

  SourcesSchedulerStartSchedule().catch((err) =>
    logger.error("SourcesSchedulerStartSchedule crashed", err),
  );
  span.end();
}

// Private Functions

async function SourcesSchedulerStartSchedule() {
  const promisePool = new PromisePool(5, config.SOURCE_FETCH_FREQUENCY / 6);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const span0 = OTelTracer().startSpan("SourcesSchedulerCycle");
    const now = new Date().getTime();

    for (const source of await SourcesDataListAll(span0)) {
      if (
        !source.info.dateFetched ||
        now - new Date(source.info.dateFetched).getTime() >
          config.SOURCE_FETCH_FREQUENCY
      ) {
        promisePool.add(async () => {
          const span = OTelTracer().startSpan("FetchSourceItems");
          await ProcessorsFetchSourceItems(span, source);
          span.end();
        });
      }
    }

    if (now - lastRulesExecution > config.SOURCE_FETCH_FREQUENCY) {
      lastRulesExecution = now;
      for (const userRules of await RulesDataListAll(span0)) {
        promisePool.add(async () => {
          const span = OTelTracer().startSpan("ExecuteUserRules");
          await RulesExecutionExecuteUserRules(span, userRules);
          span.end();
        });
      }
    }

    promisePool.add(async () => {
      const span = OTelTracer().startSpan("CleanupOrphanItems");
      await SourceItemsDataCleanupOrphans(span);
      span.end();
    });

    await SourcesSchedulerUpdateStats(span0);

    span0.end();

    await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
  }
}

// private

async function SourcesSchedulerUpdateStats(context: Span) {
  const span = OTelTracer().startSpan("SourcesSchedulerUpdateStats", context);
  const [nbReadItem, nbUnreadItem, nbSavedItem] = await Promise.all([
    SourceItemsDataGetCount(span, SourceItemStatus.read),
    SourceItemsDataGetCount(span, SourceItemStatus.unread),
    SourcesDataListCountsSaved(span),
  ]);
  statsSourceItms.itemsTotal = nbReadItem + nbUnreadItem;
  statsSourceItms.itemsRead = nbReadItem;
  statsSourceItms.itemsUnread = nbUnreadItem;
  statsSourceItms.itemsBookmarked = nbSavedItem;
  span.end();
}
