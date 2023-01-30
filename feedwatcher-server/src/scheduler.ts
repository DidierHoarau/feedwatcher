import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { SourceItemsData } from "./data/SourceItemsData";
import { SourcesData } from "./data/SourcesData";
import { SourceItemStatus } from "./model/SourceItemStatus";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { Timeout } from "./utils-std-ts/Timeout";
import * as fs from "fs-extra";
import * as path from "path";
import { Source } from "./model/Source";
import { SourceItem } from "./model/SourceItem";
import { v4 as uuidv4 } from "uuid";

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
      await Scheduler.fetchSource(span, source);
    }
    span.end();
  }

  public static async fetchSource(context: Span, source: Source) {
    const span = StandardTracer.startSpan("Scheduler_fetchSource", context);
    let processed = false;
    const lastSourceItemSaved = await SourceItemsData.getLastForSource(span, source.id);
    for (const processorFile of await fs.readdir(config.PROCESSORS_USER)) {
      if (!processed) {
        processed = await Scheduler.useProcessor(
          span,
          `${path.resolve(config.PROCESSORS_USER)}/${processorFile}`,
          source,
          lastSourceItemSaved
        );
      }
    }
    for (const processorFile of await fs.readdir(config.PROCESSORS_SYSTEM)) {
      if (!processed) {
        processed = await Scheduler.useProcessor(
          span,
          `${path.resolve(config.PROCESSORS_SYSTEM)}/${processorFile}`,
          source,
          lastSourceItemSaved
        );
      }
    }
    span.end();
  }

  private static async useProcessor(
    context: Span,
    processorPath: string,
    source: Source,
    lastSourceItemSaved: SourceItem
  ): Promise<boolean> {
    const span = StandardTracer.startSpan("Scheduler_useProcessor", context);
    if (path.extname(processorPath) !== ".js") {
      return false;
    }
    const processor = await import(processorPath);
    if (processor.test(source)) {
      let nbNewItem = 0;
      const newSourceItems = await processor.fetchLatest(source, lastSourceItemSaved);
      for (const newSourceItem of newSourceItems) {
        if (!lastSourceItemSaved || newSourceItem.datePublished > lastSourceItemSaved.datePublished) {
          nbNewItem++;
          newSourceItem.sourceId = source.id;
          newSourceItem.status = SourceItemStatus.unread;
          if (!newSourceItem.info) {
            newSourceItem.info = {};
          }
          if (!newSourceItem.id) {
            newSourceItem.id = uuidv4();
          }
          await SourceItemsData.add(span, newSourceItem);
        }
      }
      logger.info(`Source ${source.id} has ${nbNewItem} new items`);
      return true;
    }
    return false;
  }
}
