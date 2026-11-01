import { Span } from "@opentelemetry/sdk-trace";
import { Config, ConfigGet } from "../Config";
import { TimeoutWait } from "@devopsplaybook.io/common-utils";
import { RulesDataListAll } from "../rules/RulesData";
import { ProcessorsFetchSourceItems } from "../procesors/Processors";
import { ProcessorsPoolGet } from "../procesors/ProcessorsPool";
import {
  SourcesDataGetGlobalItemCounts,
  SourcesDataListAll,
  SourcesDataWarmItemCounts,
} from "./SourcesData";
import { RulesExecutionExecuteUserRules } from "../rules/RulesExecution";
import { SourceItemsDataCleanupOrphans } from "./SourceItemsData";
import { SourceIsDueForFetch } from "../model/SourceHealth";
import { NotificationsCheckNewItems } from "../notifications/Notifications";
import { NewsletterAutoRepair } from "./NewsletterProvider";
import { OTelLogger, OTelMeter, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("Scheduler");

// Orphan deletes are O(tables) and only matter for residue, so a daily pass
// is enough (the item counters are reconciled when it runs).
const ORPHAN_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Falls back to the shared config instance so the cycle functions stay
// usable (and testable) outside the full App startup.
let config: Config = ConfigGet();
let lastRulesExecution = 0;
let lastOrphanCleanup = 0; // first cycle runs it

export function SourcesSchedulerResetForTests(): void {
  lastRulesExecution = 0;
  lastOrphanCleanup = 0;
}

export async function SourcesSchedulerInit(context: Span, configIn: Config) {
  const span = OTelTracer().startSpan("SourcesSchedulerInit", context);
  config = configIn;
  await SourcesDataWarmItemCounts(span);

  OTelMeter().createObservableGauge(
    "feeds.items.queue",
    (observableResult) => {
      const counts = SourcesDataGetGlobalItemCounts();
      observableResult.observe(counts.unread, { item: "unread" });
      observableResult.observe(counts.bookmarked, {
        item: "bookmarked",
      });
    },
    "Items left to read",
  );

  OTelMeter().createObservableGauge(
    "feeds.items.total",
    (observableResult) => {
      const counts = SourcesDataGetGlobalItemCounts();
      observableResult.observe(counts.read, { item: "read" });
      observableResult.observe(counts.total, {
        item: "total",
      });
    },
    "Items in the database",
  );

  OTelMeter().createObservableGauge(
    "feeds.fetch.queue",
    (observableResult) => {
      const pool = ProcessorsPoolGet();
      observableResult.observe(pool.getQueueLength(), {
        status: "pending",
      });
      observableResult.observe(pool.getInFlightCount(), {
        status: "in-flight",
      });
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

  // Repair newsletter sources before fetching so a rotated token is fixed
  // instead of failing; a catalogue outage must never block fetching.
  try {
    await NewsletterAutoRepair(span0);
  } catch {
    logger.warn("Newsletter source auto-repair failed", span0);
  }

  for (const source of await SourcesDataListAll(span0)) {
    if (
      SourceIsDueForFetch(
        source.info,
        config.SOURCE_FETCH_FREQUENCY,
        now,
        config.SOURCE_BACKOFF_MAX,
      )
    ) {
      ProcessorsPoolGet().add(async (signal) => {
        const span = OTelTracer().startSpan("FetchSourceItems");
        try {
          await ProcessorsFetchSourceItems(span, source, signal);
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
      ProcessorsPoolGet().add(async () => {
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

  if (now - lastOrphanCleanup >= ORPHAN_CLEANUP_INTERVAL_MS) {
    // Marked at enqueue so a backed-up pool cannot enqueue duplicates.
    lastOrphanCleanup = now;
    ProcessorsPoolGet().add(async () => {
      const span = OTelTracer().startSpan("CleanupOrphanItems");
      try {
        await SourceItemsDataCleanupOrphans(span);
      } catch (err) {
        logger.error("CleanupOrphanItems failed", err, span);
      } finally {
        span.end();
      }
    });
  }

  try {
    await NotificationsCheckNewItems(span0);
  } catch (err) {
    logger.error("NotificationsCheckNewItems failed", err, span0);
  }
}
