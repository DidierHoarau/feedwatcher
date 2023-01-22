import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "../Config";
import { SourceItemsData } from "../data/SourceItemsData";
import { SourcesData } from "../data/SourcesData";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { Logger } from "../utils-std-ts/Logger";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Timeout } from "../utils-std-ts/Timeout";
import { RssProcessor } from "./RssProcessor";

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
      await Scheduler.fetchAll(span);
      span.end();
      await Timeout.wait(config.SOURCE_FETCH_FREQUENCY);
    }
  }

  public static async fetchAll(context: Span) {
    const span = StandardTracer.startSpan("Scheduler_fetchAll", context);
    const sources = await SourcesData.listAll(span);
    for (const source of sources) {
      let nbNewItem = 0;
      const lastSourceItemSaved = await SourceItemsData.getLastForSource(span, source.id);
      if (RssProcessor.test(span, source)) {
        const newSourceItems = await RssProcessor.fetchLatest(span, source, lastSourceItemSaved);
        for (const newSourceItem of newSourceItems) {
          if (!lastSourceItemSaved || newSourceItem.datePublished > lastSourceItemSaved.datePublished) {
            nbNewItem++;
            newSourceItem.sourceId = source.id;
            newSourceItem.status = SourceItemStatus.unread;
            if (!newSourceItem.info) {
              newSourceItem.info = {};
            }
            await SourceItemsData.add(span, newSourceItem);
          }
        }
      }
      logger.info(`Source ${source.id} has ${nbNewItem} new items`);
    }
    span.end();
  }
}
