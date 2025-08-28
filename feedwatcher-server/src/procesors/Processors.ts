import { Span } from "@opentelemetry/sdk-trace-base";
import { Config } from "../Config";
import { SourceItemStatus } from "../model/SourceItemStatus";
import * as fs from "fs-extra";
import * as path from "path";
import { find, merge, sortBy } from "lodash";
import { Source } from "../model/Source";
import { v4 as uuidv4 } from "uuid";
import { ProcessorInfo } from "../model/ProcessorInfo";
import { UserProcessorInfoStatus } from "../model/UserProcessorInfoStatus";
import { UserProcessorInfo } from "../model/UserProcessorInfo";
import {
  SourcesDataListForUser,
  SourcesDataUpdate,
} from "../sources/SourcesData";
import {
  SourceItemsDataAdd,
  SourceItemsDataGetLastForSource,
} from "../sources/SourceItemsData";
import { OTelLogger, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("Processor");
let config: Config;
let processorsFiles = [];
const userProcessorInfoStatus: UserProcessorInfo[] = [];
const fetchSourceItemsQueue: Source[] = [];

export async function ProcessorsInit(
  context: Span,
  configIn: Config
): Promise<void> {
  const span = OTelTracer().startSpan("ProcessorsInit", context);
  config = configIn;
  for (const processorsFile of await fs.readdir(config.PROCESSORS_USER)) {
    if (path.extname(processorsFile) === ".js") {
      processorsFiles.push({
        name: processorsFile,
        path: `${path.resolve(config.PROCESSORS_USER)}/${processorsFile}`,
      });
    }
  }
  for (const processorsFile of await fs.readdir(config.PROCESSORS_SYSTEM)) {
    if (path.extname(processorsFile) === ".js") {
      processorsFiles.push({
        name: processorsFile,
        path: `${path.resolve(config.PROCESSORS_SYSTEM)}/${processorsFile}`,
      });
    }
  }
  processorsFiles = sortBy(processorsFiles, ["name"]);
  logger.info(`Found ${processorsFiles.length} processors`);
  span.end();
}

export async function ProcessorsGetInfos(
  context: Span
): Promise<ProcessorInfo[]> {
  const span = OTelTracer().startSpan("ProcessorsGetInfos", context);
  const processorInfos = [];
  for (const processorsFile of processorsFiles) {
    try {
      const processor = await import(processorsFile.path);
      processorInfos.push(processor.getInfo());
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // Nothing
    }
  }
  span.end();
  return processorInfos;
}

export async function ProcessorsCheckSource(context: Span, source: Source) {
  const span = OTelTracer().startSpan("ProcessorsCheckSource", context);
  if (!source.info.processorPath) {
    userProcessorInfoStatusStart(span, source.userId);
    let processed = false;
    for (const processorsFile of processorsFiles) {
      if (!processed) {
        try {
          const processor = await import(processorsFile.path);
          const sourceInfo = await processor.test(source);
          if (sourceInfo) {
            sourceInfo.processorPath = processorsFile.path;
            source.name = sourceInfo.name;
            if (!source.info) {
              source.info = {};
            }
            source.info = merge(source.info, sourceInfo);
            await SourcesDataUpdate(span, source);
            processed = true;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          // Nothing to do
        }
      }
      userProcessorInfoStatusStop(span, source.userId);
    }
  }
  span.end();
}

export async function ProcessorsFetchSourceItemsForUser(
  context: Span,
  userId: string
) {
  const span = OTelTracer().startSpan(
    "ProcessorsFetchSourceItemsForUser",
    context
  );
  const sources = await SourcesDataListForUser(span, userId);
  for (const source of sources) {
    await ProcessorsFetchSourceItems(span, source);
  }
  span.end();
}

export async function ProcessorsFetchSourceItems(
  context: Span,
  source: Source
): Promise<void> {
  if (!find(fetchSourceItemsQueue, { id: source.id })) {
    fetchSourceItemsQueue.push(source);
    if (fetchSourceItemsQueue.length === 1) {
      fetchSourceItemsQueued();
    }
  }
}

export function ProcessorsGetUserProcessorInfo(
  context: Span,
  userId: string
): UserProcessorInfo {
  const span = OTelTracer().startSpan(
    "ProcessorsGetUserProcessorInfo",
    context
  );
  return find(userProcessorInfoStatus, { userId });
  span.end();
}

// Private Functions

async function fetchSourceItemsQueued(): Promise<void> {
  if (fetchSourceItemsQueue.length === 0) {
    return;
  }
  const span = OTelTracer().startSpan("fetchSourceItemsQueued");
  const source = fetchSourceItemsQueue[0];
  userProcessorInfoStatusStart(span, source.userId);
  let processed = false;
  const lastSourceItemSaved = await SourceItemsDataGetLastForSource(
    span,
    source.id
  );
  for (const processorsFile of processorsFiles) {
    if (!processed) {
      try {
        const processor = await import(processorsFile.path);
        if (await processor.test(source)) {
          let nbNewItem = 0;
          const newSourceItems = await processor.fetchLatest(
            source,
            lastSourceItemSaved
          );
          for (const newSourceItem of newSourceItems) {
            if (
              !lastSourceItemSaved ||
              newSourceItem.datePublished > lastSourceItemSaved.datePublished
            ) {
              nbNewItem++;
              newSourceItem.sourceId = source.id;
              newSourceItem.status = SourceItemStatus.unread;
              if (!newSourceItem.info) {
                newSourceItem.info = {};
              }
              if (!newSourceItem.id) {
                newSourceItem.id = uuidv4();
              }
              await SourceItemsDataAdd(span, newSourceItem);
            }
          }
          logger.info(`Source ${source.id} has ${nbNewItem} new items`);
          if (source.info.processorPath !== processorsFile.path) {
            logger.info(`Updating source processor`);
          }
          source.info.processorPath = processorsFile.path;
          source.info.dateFetched = new Date();
          await SourcesDataUpdate(span, source);
          processed = true;
        }
      } catch (err) {
        logger.error(err);
      }
    }
  }
  if (!processed) {
    logger.warn(`No processor found for ${source.id} (${source.name})`);
  }
  userProcessorInfoStatusStop(span, source.userId);
  span.end();
  fetchSourceItemsQueue.shift();
  fetchSourceItemsQueued();
}

function userProcessorInfoStatusStart(context: Span, userId: string): void {
  const span = OTelTracer().startSpan("userProcessorInfoStatusStart", context);
  let userStatus = find(userProcessorInfoStatus, { userId });
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

function userProcessorInfoStatusStop(context: Span, userId: string): void {
  const span = OTelTracer().startSpan("userProcessorInfoStatusStop", context);
  const userStatus = find(userProcessorInfoStatus, { userId });
  if (userStatus) {
    userStatus.status = UserProcessorInfoStatus.idle;
    userStatus.lastUpdate = new Date();
  }
  span.end();
}
