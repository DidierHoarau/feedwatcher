import { Span } from "@opentelemetry/sdk-trace-base";
import { Config, ConfigGet } from "../Config";
import { TimeoutWait } from "@devopsplaybook.io/common-utils";
import { RulesDataListAll } from "../rules/RulesData";
import { ProcessorsFetchSourceItems } from "../procesors/Processors";
import { SourcesDataListAll, SourcesDataListCountsSaved } from "./SourcesData";
import { RulesExecutionExecuteUserRules } from "../rules/RulesExecution";
import {
  SourceItemsDataCleanupOrphans,
  SourceItemsDataGetCount,
} from "./SourceItemsData";
import { PromisePool } from "../utils-std-ts/PromisePool";
import { SourceIsDueForFetch } from "../model/SourceHealth";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { OTelLogger, OTelMeter, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("Scheduler");

// Falls back to the shared config instance so the cycle functions stay
// usable (and testable) outside the full App startup.
let config: Config = ConfigGet();
let lastRulesExecution = 0;
let promisePool: PromisePool;

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
    "Items left to read",
  );

  OTelMeter().createObservableGauge(
    "feeds.items.total",
    (observableResult) => {
      observableResult.observe(statsSourceItms.itemsRead, { item: "read" });
      observableResult.observe(statsSourceItms.itemsTotal, {
        item: "total",
      });
    },
    "Items in the database",
  );

  OTelMeter().createObservableGauge(
    "feeds.fetch.queue",
    (observableResult) => {
      if (promisePool) {
        observableResult.observe(promisePool.getQueueLength(), {
          status: "pending",
        });
        observableResult.observe(promisePool.getInFlightCount(), {
          status: "in-flight",
        });
      }
    },
    "Feed source fetch queue depth",
  );

  SourcesSchedulerStartSchedule().catch((err) =>
    logger.error("SourcesSchedulerStartSchedule crashed", err),
  );
  span.end();
}

// Private Functions

async function SourcesSchedulerStartSchedule() {
  while (true) {
    await SourcesSchedulerCycle();
    await TimeoutWait(config.SOURCE_FETCH_FREQUENCY / 4);
  }
}

function promisePoolGet(): PromisePool {
  if (!promisePool) {
    promisePool = new PromisePool(
      config.PROCESSOR_CONCURRENCY,
      config.SOURCE_FETCH_FREQUENCY / 6,
    );
  }
  return promisePool;
}

// Runs one scheduler cycle; any failure is logged and swallowed so the
// schedule loop keeps iterating (a thrown error must not kill fetching).
export async function SourcesSchedulerCycle(): Promise<void> {
  const span0 = OTelTracer().startSpan("SourcesSchedulerCycle");
  try {
    await SourcesSchedulerRunCycle(span0);
  } catch (err) {
    logger.error("Scheduler cycle failed", err, span0);
  } finally {
    span0.end();
  }
}

// Visible for tests: the body of one scheduler cycle.
export async function SourcesSchedulerRunCycle(span0: Span): Promise<void> {
  const now = new Date().getTime();

  for (const source of await SourcesDataListAll(span0)) {
    if (
      SourceIsDueForFetch(
        source.info,
        config.SOURCE_FETCH_FREQUENCY,
        now,
        config.SOURCE_BACKOFF_MAX,
      )
    ) {
      promisePoolGet().add(async () => {
        const span = OTelTracer().startSpan("FetchSourceItems");
        try {
          await ProcessorsFetchSourceItems(span, source);
        } catch (err) {
          logger.error(
            `FetchSourceItems failed for source ${source.id}`,
            err,
            span,
          );
        } finally {
          span.end();
        }
      });
    }
  }

  if (now - lastRulesExecution > config.SOURCE_FETCH_FREQUENCY) {
    lastRulesExecution = now;
    for (const userRules of await RulesDataListAll(span0)) {
      promisePoolGet().add(async () => {
        const span = OTelTracer().startSpan("ExecuteUserRules");
        try {
          await RulesExecutionExecuteUserRules(span, userRules);
        } catch (err) {
          logger.error(
            `ExecuteUserRules failed for user ${userRules.userId}`,
            err,
            span,
          );
        } finally {
          span.end();
        }
      });
    }
  }

  promisePoolGet().add(async () => {
    const span = OTelTracer().startSpan("CleanupOrphanItems");
    try {
      await SourceItemsDataCleanupOrphans(span);
    } catch (err) {
      logger.error("CleanupOrphanItems failed", err, span);
    } finally {
      span.end();
    }
  });

  await SourcesSchedulerUpdateStats(span0);
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
