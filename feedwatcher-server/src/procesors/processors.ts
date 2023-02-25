import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "../Config";
import { SourceItemsData } from "../data/SourceItemsData";
import { SourcesData } from "../data/SourcesData";
import { SourceItemStatus } from "../model/SourceItemStatus";
import { Logger } from "../utils-std-ts/Logger";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import * as fs from "fs-extra";
import * as path from "path";
import * as _ from "lodash";
import { Source } from "../model/Source";
import { v4 as uuidv4 } from "uuid";
import { ProcessorInfo } from "../model/ProcessorInfo";
import { UserProcessorInfoStatus } from "../model/UserProcessorInfoStatus";
import { UserProcessorInfo } from "../model/UserProcessorInfo";

const logger = new Logger("Processor");
let config: Config;
let processorFiles = [];
const userProcessorInfoStatus: UserProcessorInfo[] = [];
const fetchSourceItemsQueue: Source[] = [];

export class Processors {
  //
  public static async init(context: Span, configIn: Config): Promise<void> {
    const span = StandardTracer.startSpan("Processors_init", context);
    config = configIn;
    for (const processorFile of await fs.readdir(config.PROCESSORS_USER)) {
      if (path.extname(processorFile) === ".js") {
        processorFiles.push({
          name: processorFile,
          path: `${path.resolve(config.PROCESSORS_USER)}/${processorFile}`,
        });
      }
    }
    for (const processorFile of await fs.readdir(config.PROCESSORS_SYSTEM)) {
      if (path.extname(processorFile) === ".js") {
        processorFiles.push({
          name: processorFile,
          path: `${path.resolve(config.PROCESSORS_SYSTEM)}/${processorFile}`,
        });
      }
    }
    processorFiles = _.sortBy(processorFiles, ["name"]);
    logger.info(`Found ${processorFiles.length} processors`);
    span.end();
  }

  public static async getInfos(context: Span): Promise<ProcessorInfo[]> {
    const span = StandardTracer.startSpan("Processors_getInfos", context);
    const processorInfos = [];
    for (const processorFile of processorFiles) {
      try {
        const processor = await import(processorFile.path);
        processorInfos.push(processor.getInfo());
      } catch (err) {
        // Nothing
      }
    }

    span.end();
    return processorInfos;
  }

  public static async checkSource(context: Span, source: Source) {
    const span = StandardTracer.startSpan("Processors_checkSource", context);
    if (!source.info.processorPath) {
      Processors.userProcessorInfoStatusStart(span, source.userId);
      let processed = false;
      for (const processorFile of processorFiles) {
        if (!processed) {
          try {
            const processor = await import(processorFile.path);
            const sourceInfo = await processor.test(source);
            if (sourceInfo) {
              sourceInfo.processorPath = processorFile.path;
              source.name = sourceInfo.name;
              if (!source.info) {
                source.info = {};
              }
              source.info = _.merge(source.info, sourceInfo);
              await SourcesData.update(span, source);
              processed = true;
            }
          } catch (err) {
            // Nothing to do
            // logger.error(err);
          }
        }
        Processors.userProcessorInfoStatusStop(span, source.userId);
      }
    }
    span.end();
  }

  public static async fetchSourceItemsAll(context: Span) {
    const span = StandardTracer.startSpan("Processors_fetchSourceItemsAll", context);
    const sources = await SourcesData.listAll(span);
    for (const source of sources) {
      await Processors.fetchSourceItems(span, source);
    }
    span.end();
  }

  public static async fetchSourceItemsForUser(context: Span, userId: string) {
    const span = StandardTracer.startSpan("Processors_fetchSourceItemsForUser", context);
    const sources = await SourcesData.listForUser(span, userId);
    for (const source of sources) {
      await Processors.fetchSourceItems(span, source);
    }
    span.end();
  }

  public static async fetchSourceItems(context: Span, source: Source): Promise<void> {
    if (!_.find(fetchSourceItemsQueue, { id: source.id })) {
      fetchSourceItemsQueue.push(source);
      if (fetchSourceItemsQueue.length === 1) {
        Processors.fetchSourceItemsQueued();
      }
    }
  }

  private static async fetchSourceItemsQueued(): Promise<void> {
    if (fetchSourceItemsQueue.length === 0) {
      return;
    }
    const span = StandardTracer.startSpan("Processors_fetchSourceItemsQueued");
    const source = fetchSourceItemsQueue[0];
    Processors.userProcessorInfoStatusStart(span, source.userId);
    let processed = false;
    const lastSourceItemSaved = await SourceItemsData.getLastForSource(span, source.id);
    for (const processorFile of processorFiles) {
      if (!processed) {
        try {
          const processor = await import(processorFile.path);
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
            if (source.info.processorPath !== processorFile.path) {
              logger.info(`Updating source processor`);
              source.info.processorPath = processorFile.path;
              await SourcesData.update(span, source);
            }
            processed = true;
          }
        } catch (err) {
          logger.error(err);
        }
      }
    }
    if (!processed) {
      logger.warn(`No processor found for ${source.id}`);
    }
    Processors.userProcessorInfoStatusStop(span, source.userId);
    span.end();
    fetchSourceItemsQueue.shift();
    Processors.fetchSourceItemsQueued();
  }

  public static getUserProcessorInfo(context: Span, userId: string): UserProcessorInfo {
    const span = StandardTracer.startSpan("Processors_getUserProcessorInfo", context);
    return _.find(userProcessorInfoStatus, { userId });
    span.end();
  }

  private static userProcessorInfoStatusStart(context: Span, userId: string): void {
    const span = StandardTracer.startSpan("Processors_userProcessorInfoStatusStart", context);
    let userStatus = _.find(userProcessorInfoStatus, { userId });
    if (!userStatus) {
      userStatus = {
        userId: userId,
        status: UserProcessorInfoStatus.working,
      };
      userProcessorInfoStatus.push(userStatus);
    }
    userStatus.status = UserProcessorInfoStatus.working;
    span.end();
  }

  private static userProcessorInfoStatusStop(context: Span, userId: string): void {
    const span = StandardTracer.startSpan("Processors_userProcessorInfoStatusStop", context);
    const userStatus = _.find(userProcessorInfoStatus, { userId });
    if (userStatus) {
      userStatus.status = UserProcessorInfoStatus.idle;
      userStatus.lastUpdate = new Date();
    }
    span.end();
  }
}
