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
import { OTelLogger, OTelMeter, OTelTracer } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("Processor");
let config: Config;
let processorsFiles = [];
const userProcessorInfoStatus: UserProcessorInfo[] = [];
const sourcesInFlight = new Set<string>();

export async function ProcessorsInit(
  context: Span,
  configIn: Config,
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
  logger.info(`Found ${processorsFiles.length} processors`, span);

  OTelMeter().createObservableGauge(
    "feedwatcher.processor.inflight",
    (observableResult) => {
      observableResult.observe(sourcesInFlight.size, { status: "in-flight" });
    },
    "Sources currently being fetched by processors",
  );

  span.end();
}

export async function ProcessorsGetInfos(
  context: Span,
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
  userId: string,
) {
  const span = OTelTracer().startSpan(
    "ProcessorsFetchSourceItemsForUser",
    context,
  );
  const sources = await SourcesDataListForUser(span, userId);
  for (const source of sources) {
    await ProcessorsFetchSourceItems(span, source);
  }
  span.end();
}

export async function ProcessorsFetchSourceItems(
  context: Span,
  source: Source,
): Promise<void> {
  if (sourcesInFlight.has(source.id)) {
    return;
  }

  sourcesInFlight.add(source.id);
  userProcessorInfoStatusStart(context, source.userId);

  try {
    let processed = false;
    const lastSourceItemSaved = await SourceItemsDataGetLastForSource(
      context,
      source.id,
    );
    for (const processorsFile of processorsFiles) {
      if (!processed) {
        try {
          const processor = await import(processorsFile.path);
          if (await processor.test(source)) {
            let nbNewItem = 0;
            const newSourceItems = await processor.fetchLatest(
              source,
              lastSourceItemSaved,
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
                await SourceItemsDataAdd(context, newSourceItem);
              }
            }
            logger.info(
              `Source ${source.id} has ${nbNewItem} new items`,
              context,
            );
            if (source.info.processorPath !== processorsFile.path) {
              logger.info(`Updating source processor`, context);
            }
            source.info.processorPath = processorsFile.path;
            source.info.dateFetched = new Date();
            await SourcesDataUpdate(context, source);
            processed = true;
          }
        } catch (err) {
          logger.error("Error Fetching Source", err);
        }
      }
    }
    if (!processed) {
      logger.warn(
        `No processor found for ${source.id} (${source.name})`,
        context,
      );
    }
  } finally {
    sourcesInFlight.delete(source.id);
    userProcessorInfoStatusStop(context, source.userId);
  }
}

export function ProcessorsGetUserProcessorInfo(
  context: Span,
  userId: string,
): UserProcessorInfo {
  const span = OTelTracer().startSpan(
    "ProcessorsGetUserProcessorInfo",
    context,
  );
  const result = find(userProcessorInfoStatus, { userId });
  span.end();
  return result;
}

// Private Functions

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
