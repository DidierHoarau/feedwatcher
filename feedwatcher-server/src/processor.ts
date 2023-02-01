import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "./Config";
import { SourceItemsData } from "./data/SourceItemsData";
import { SourcesData } from "./data/SourcesData";
import { SourceItemStatus } from "./model/SourceItemStatus";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import * as fs from "fs-extra";
import * as path from "path";
import * as _ from "lodash";
import { Source } from "./model/Source";
import { SourceItem } from "./model/SourceItem";
import { v4 as uuidv4 } from "uuid";

const logger = new Logger("Processor");
let config: Config;

export class Processor {
  //
  public static async init(context: Span, configIn: Config) {
    const span = StandardTracer.startSpan("Scheduler_init", context);
    config = configIn;
    span.end();
  }

  public static async checkSource(context: Span, source: Source) {
    const span = StandardTracer.startSpan("Processor_checkSource", context);
    if (source.info.processorPath) {
      return;
    }
    let processed = false;
    for (const processorFile of await fs.readdir(config.PROCESSORS_USER)) {
      if (!processed) {
        processed = await Processor.processorGetSourceInfo(
          span,
          `${path.resolve(config.PROCESSORS_USER)}/${processorFile}`,
          source
        );
      }
    }
    for (const processorFile of await fs.readdir(config.PROCESSORS_SYSTEM)) {
      if (!processed) {
        processed = await Processor.processorGetSourceInfo(
          span,
          `${path.resolve(config.PROCESSORS_SYSTEM)}/${processorFile}`,
          source
        );
      }
    }
    span.end();
  }

  public static async fetchSourceItemsAll(context: Span) {
    const span = StandardTracer.startSpan("Processor_fetchAll", context);
    const sources = await SourcesData.listAll(span);
    for (const source of sources) {
      await Processor.fetchSourceItems(span, source);
    }
    span.end();
  }

  public static async fetchSourceItems(context: Span, source: Source) {
    const span = StandardTracer.startSpan("Processor_fetchSource", context);
    let processed = false;
    const lastSourceItemSaved = await SourceItemsData.getLastForSource(span, source.id);
    if (source.info.processorPath && fs.pathExists(source.info.processorPath)) {
      processed = await Processor.processorGetSourceItems(
        span,
        `${source.info.processorPath}`,
        source,
        lastSourceItemSaved
      );
    }
    for (const processorFile of await fs.readdir(config.PROCESSORS_USER)) {
      if (!processed) {
        processed = await Processor.processorGetSourceItems(
          span,
          `${path.resolve(config.PROCESSORS_USER)}/${processorFile}`,
          source,
          lastSourceItemSaved
        );
      }
    }
    for (const processorFile of await fs.readdir(config.PROCESSORS_SYSTEM)) {
      if (!processed) {
        processed = await Processor.processorGetSourceItems(
          span,
          `${path.resolve(config.PROCESSORS_SYSTEM)}/${processorFile}`,
          source,
          lastSourceItemSaved
        );
      }
    }
    span.end();
  }

  private static async processorGetSourceInfo(context: Span, processorPath: string, source: Source): Promise<boolean> {
    const span = StandardTracer.startSpan("Processor_useProcessor", context);
    if (path.extname(processorPath) !== ".js") {
      return false;
    }
    try {
      const processor = await import(processorPath);
      const sourceInfo = await processor.test(source);
      if (sourceInfo) {
        sourceInfo.processorPath = processorPath;
        source.name = sourceInfo.name;
        if (!source.info) {
          source.info = {};
        }
        source.info = _.merge(source.info, sourceInfo);
        await SourcesData.update(span, source);
      }
    } catch (err) {
      // logger.error(err);
    }
    return false;
  }

  private static async processorGetSourceItems(
    context: Span,
    processorPath: string,
    source: Source,
    lastSourceItemSaved: SourceItem
  ): Promise<boolean> {
    const span = StandardTracer.startSpan("Processor_useProcessor", context);
    if (path.extname(processorPath) !== ".js") {
      return false;
    }
    try {
      const processor = await import(processorPath);
      if (await processor.test(source)) {
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
    } catch (err) {
      // logger.error(err);
    }
    return false;
  }
}