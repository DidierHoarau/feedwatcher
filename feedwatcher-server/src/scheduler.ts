import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { Timeout } from "./utils-std-ts/Timeout";
import { SourcesData } from "./data/SourcesData";
import { SourceItemsData } from "./data/SourceItemsData";
import { RulesData } from "./data/RulesData";
import { SearchItemsData } from "./data/SearchItemsData";
import { minimatch } from "minimatch";
import { SourceItemStatus } from "./model/SourceItemStatus";
import { Logger } from "./utils-std-ts/Logger";
import { Processors } from "./procesors/processors";
import { SourceItem } from "./model/SourceItem";

const logger = new Logger("Scheduler");
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

      // Rules
      for (const userRules of await RulesData.listAll(span)) {
        let rulesMarkRead = 0;
        let rulesDelete = 0;
        for (const sourceRules of userRules.info) {
          if (sourceRules.autoRead) {
            for (const rule of sourceRules.autoRead) {
              let itemList: SourceItem[] = [];
              if (sourceRules.isRoot) {
                itemList = (
                  await SearchItemsData.listForUser(span, userRules.userId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              } else if (sourceRules.labelName) {
                itemList = (
                  await SearchItemsData.listItemsForLabel(span, sourceRules.labelName, userRules.userId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              } else if (sourceRules.sourceId) {
                itemList = (
                  await SearchItemsData.listForSource(span, sourceRules.sourceId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              }
              for (const item of itemList) {
                if (minimatch(item.title, rule.pattern)) {
                  await SourceItemsData.updateMultipleStatusForUser(
                    span,
                    [item.id],
                    SourceItemStatus.read,
                    userRules.id
                  );
                  rulesMarkRead++;
                }
              }
            }
          }
          if (sourceRules.autoDelete) {
            for (const rule of sourceRules.autoDelete) {
              let itemList: SourceItem[] = [];
              if (sourceRules.isRoot) {
                itemList = (
                  await SearchItemsData.listForUser(span, userRules.userId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              } else if (sourceRules.labelName) {
                itemList = (
                  await SearchItemsData.listItemsForLabel(span, sourceRules.labelName, userRules.userId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              } else if (sourceRules.sourceId) {
                itemList = (
                  await SearchItemsData.listForSource(span, sourceRules.sourceId, {
                    maxDate: new Date(new Date().getTime() - rule.ageDays * 24 * 3600 * 1000),
                    page: -1,
                  })
                ).sourceItems;
              }
              for (const item of itemList) {
                if (minimatch(item.title, rule.pattern)) {
                  await SourceItemsData.delete(span, item.id);
                  rulesDelete++;
                }
              }
            }
          }
          logger.info(`Rules for ${userRules.userId}: ${rulesMarkRead} marked read ; ${rulesDelete} deleted`);
        }
      }

      span.end();
      await Timeout.wait(config.SOURCE_FETCH_FREQUENCY / 4);
    }
  }
}
