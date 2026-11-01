import { Span } from "@opentelemetry/sdk-trace";
import { Config } from "../Config";
import { SourceItemStatus } from "../model/SourceItemStatus";
import {
  SourceFetchErrorClassify,
  SourceFetchErrorInfo,
} from "../model/SourceFetchError";
import { SourceShouldAutoDisable } from "../model/SourceHealth";
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
  SourceItemsDataAddMany,
  SourceItemsDataGetLastForSource,
  SourceItemDateNormalize,
} from "../sources/SourceItemsData";
import {
  SourcesFetchStateDataGet,
  SourcesFetchStateDataSave,
} from "../sources/SourcesFetchStateData";
import { OTelLogger, OTelTracer } from "../OTelContext";
import { NewsletterFetchOptionsForSource } from "../sources/NewsletterFetch";
import {
  newsletterRedactText,
  newsletterRedactUrl,
} from "../sources/NewsletterMatching";

const logger = OTelLogger().createModuleLogger("Processor");
let config: Config;
let processorsFiles = [];
const userProcessorInfoStatus: UserProcessorInfo[] = [];
const sourcesInFlight = new Set<string>();

const feedCacheLib = require(path.join(
  __dirname,
  "../../processors-system/lib/feed-cache.js",
));

function feedFetchContext(validators, signal, info) {
  return feedCacheLib.createFeedFetchContext({
    validators,
    signal,
    ...NewsletterFetchOptionsForSource(info),
  });
}

export async function ProcessorsInit(
  context: Span,
  configIn: Config,
): Promise<void> {
  const span = OTelTracer().startSpan("ProcessorsInit", context);
  config = configIn;
  const ssrfHttp = require(path.join(
    __dirname,
    "../../processors-system/lib/ssrf-http.js",
  ));
  ssrfHttp.configure({
    allowPrivateNetwork: configIn.SOURCE_ALLOW_PRIVATE_NETWORK === true,
  });
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

  span.end();
}

export async function ProcessorsGetInfos(
  context: Span,
): Promise<ProcessorInfo[]> {
  const span = OTelTracer().startSpan("ProcessorsGetInfos", context);
  const processorInfos = [];
  for (const processorsFile of processorsFiles) {
    try {
      const processor = await ProcessorsLoadFile(processorsFile);
      processorInfos.push(processor.getInfo());
      // oxlint-disable-next-line no-unused-vars
    } catch (err) {
      logger.warn(
        `Failed to load processor ${processorsFile.name}: ${err.message}`,
        span,
      );
    }
  }
  span.end();
  return processorInfos;
}

export async function ProcessorsCheckSource(
  context: Span,
  source: Source,
): Promise<string | null> {
  const span = OTelTracer().startSpan("ProcessorsCheckSource", context);
  let lastError: Error = null;
  if (!source.info.processorPath) {
    userProcessorInfoStatusStart(span, source.userId);
    const sourceContext = feedFetchContext(null, null, source.info);
    let processed = false;
    for (const processorsFile of processorsFiles) {
      if (!processed) {
        try {
          const processor = await ProcessorsLoadFile(processorsFile);
          const sourceInfo = await processor.test(source, sourceContext);
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
        } catch (err) {
          logger.warn(
            `Processor ${processorsFile.name} failed to test source ${source.id} (${newsletterRedactUrl(source.info.url)}): ${err.message}`,
            span,
          );
          lastError = err;
        }
      }
    }
    userProcessorInfoStatusStop(span, source.userId);
  }
  span.end();
  return lastError
    ? newsletterRedactText(
        lastError.message ? lastError.message : String(lastError),
      )
    : null;
}

export interface ProcessorPreviewItem {
  title: string;
  url: string;
  datePublished: Date | string | null;
  thumbnail: string;
}

export interface ProcessorPreview {
  processorTitle: string;
  processorIcon: string;
  name: string;
  items: ProcessorPreviewItem[];
}

// Detects the processor for a transient (unsaved) source and fetches a small
// sample of its latest items. Nothing is persisted: unlike
// ProcessorsCheckSource this never calls SourcesDataUpdate.
export async function ProcessorsPreviewSource(
  context: Span,
  source: Source,
): Promise<{ preview: ProcessorPreview | null; error: string | null }> {
  const span = OTelTracer().startSpan("ProcessorsPreviewSource", context);
  let lastError: Error = null;
  let preview: ProcessorPreview | null = null;
  const sourceContext = feedFetchContext(null, null, source.info);
  userProcessorInfoStatusStart(span, source.userId);
  try {
    for (const processorsFile of processorsFiles) {
      if (preview) {
        break;
      }
      try {
        const processor = await ProcessorsLoadFile(processorsFile);
        const sourceInfo = await processor.test(source, sourceContext);
        if (sourceInfo) {
          sourceInfo.processorPath = processorsFile.path;
          source.name = sourceInfo.name;
          if (!source.info) {
            source.info = {};
          }
          source.info = merge(source.info, sourceInfo);
          const sourceItems = await processor.fetchLatest(
            source,
            null,
            sourceContext,
          );
          preview = {
            processorTitle: processor.getInfo().title,
            processorIcon: sourceInfo.icon || "",
            name: sourceInfo.name,
            items: sourceItems.slice(0, 5).map((sourceItem: any) => ({
              title: sourceItem.title || "",
              url: sourceItem.url || "",
              datePublished: sourceItem.datePublished || null,
              thumbnail: sourceItem.thumbnail || "",
            })),
          };
        }
      } catch (err) {
        logger.warn(
          `Processor ${processorsFile.name} failed to preview source ${newsletterRedactUrl(source.info.url)}: ${err.message}`,
          span,
        );
        lastError = err;
      }
    }
  } finally {
    userProcessorInfoStatusStop(span, source.userId);
  }
  span.end();
  return {
    preview,
    error: lastError
      ? newsletterRedactText(
          lastError.message ? lastError.message : String(lastError),
        )
      : null,
  };
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
  signal?: AbortSignal,
): Promise<void> {
  if (sourcesInFlight.has(source.id)) {
    return;
  }

  sourcesInFlight.add(source.id);
  userProcessorInfoStatusStart(context, source.userId);

  try {
    let processed = false;
    let lastError: Error = null;
    let lastErrorInfo: SourceFetchErrorInfo = null;
    const lastSourceItemSaved = await SourceItemsDataGetLastForSource(
      context,
      source.id,
    );
    // HTTP validators are only meaningful for a source whose processor was
    // already detected: running a conditional GET before the initial import
    // would answer 304 and never store the first items.
    const fetchState =
      source.info && source.info.processorPath
        ? await SourcesFetchStateDataGet(context, source.id)
        : null;
    const sourceContext = feedFetchContext(
      fetchState && source.info.url && fetchState.url === source.info.url
        ? fetchState
        : null,
      signal,
      source.info,
    );
    for (const processorsFile of processorsFiles) {
      if (!processed) {
        try {
          const processor = await ProcessorsLoadFile(processorsFile);
          if (await processor.test(source, sourceContext)) {
            let skippedItemCount = 0;
            let lastItemDate: Date = null;
            const newSourceItems = await processor.fetchLatest(
              source,
              lastSourceItemSaved,
              sourceContext,
            );
            const sourceItemsToSave = [];
            for (const newSourceItem of newSourceItems) {
              try {
                const itemDate = SourceItemDateNormalize(
                  newSourceItem.datePublished,
                );
                if (!itemDate) {
                  skippedItemCount++;
                  logger.warn(
                    `Skipping item with an invalid datePublished for source ${source.id} (${source.name})`,
                    context,
                  );
                  continue;
                }
                newSourceItem.datePublished = itemDate;
                if (!lastItemDate || itemDate.getTime() > lastItemDate.getTime()) {
                  lastItemDate = itemDate;
                }
                if (
                  !lastSourceItemSaved ||
                  itemDate.getTime() >=
                    lastSourceItemSaved.datePublished.getTime()
                ) {
                  newSourceItem.sourceId = source.id;
                  newSourceItem.status = SourceItemStatus.unread;
                  if (!newSourceItem.info) {
                    newSourceItem.info = {};
                  }
                  if (!newSourceItem.id) {
                    newSourceItem.id = uuidv4();
                  }
                  sourceItemsToSave.push(newSourceItem);
                }
              } catch (err) {
                // One malformed item must not abort the whole fetch
                skippedItemCount++;
                logger.warn(
                  `Skipping invalid item for source ${source.id} (${source.name}): ${err.message}`,
                  context,
                );
              }
            }
            let insertedItemCount = 0;
            if (sourceItemsToSave.length > 0) {
              const addResult = await SourceItemsDataAddMany(
                context,
                source.id,
                source.userId,
                sourceItemsToSave,
              );
              insertedItemCount = addResult.inserted;
              skippedItemCount += addResult.skipped;
            }
            logger.info(
              `Source ${source.id} has ${insertedItemCount} new items (${skippedItemCount} skipped)`,
              context,
            );
            if (source.info.processorPath !== processorsFile.path) {
              logger.info(`Updating source processor`, context);
            }
            source.info.processorPath = processorsFile.path;
            source.info.dateFetched = new Date();
            source.info.lastAttemptDate = new Date();
            source.info.fetchErrorCount = 0;
            delete source.info.autoDisabled;
            delete source.info.autoDisabledDate;
            delete source.info.autoDisabledReason;
            delete source.info.retryAfterUntil;
            if (lastItemDate) {
              source.info.lastItemDate = lastItemDate;
            }
            await SourcesDataUpdate(context, source);
            processed = true;
          }
        } catch (err) {
          if (err && err.name === "FeedNotModifiedError") {
            // HTTP 304 is a successful fetch, handled after the loop.
            continue;
          }
          lastErrorInfo = SourceFetchErrorClassify(err);
          // context can be undefined when the request span is not available
          context?.setAttributes({
            "feedwatcher.source.id": source.id,
            "feedwatcher.source.fetch.error.class": lastErrorInfo.errorClass,
            "feedwatcher.source.fetch.error.status":
              lastErrorInfo.status ?? undefined,
          });
          logger.error("Error Fetching Source", err, context);
          lastError = err;
        }
      }
    }
    if (!source.info) {
      source.info = {};
    }
    source.info.lastAttemptDate = new Date();
    if (
      !processed &&
      source.info.processorPath &&
      sourceContext.isNotModified(source.info.url)
    ) {
      // The feed answered 304: no new items, but the fetch succeeded.
      logger.info(`Source ${source.id} has 0 new items`, context);
      source.info.dateFetched = new Date();
      source.info.fetchErrorCount = 0;
      delete source.info.autoDisabled;
      delete source.info.autoDisabledDate;
      delete source.info.autoDisabledReason;
      delete source.info.retryAfterUntil;
      await SourcesDataUpdate(context, source);
      processed = true;
    }
    if (!processed) {
      const fetchErrorCount = (Number(source.info.fetchErrorCount) || 0) + 1;
      source.info.fetchErrorCount = fetchErrorCount;
      source.info.lastFetchError = newsletterRedactText(
        lastError
          ? lastError.message
            ? lastError.message
            : String(lastError)
          : "No processor found for this source",
      );
      source.info.lastFetchErrorDate = new Date();
      source.info.lastFetchErrorStatus = lastErrorInfo
        ? lastErrorInfo.status
        : null;
      source.info.lastFetchErrorClass = lastErrorInfo
        ? lastErrorInfo.errorClass
        : "unknown";
      if (lastErrorInfo && lastErrorInfo.retryAfterSeconds) {
        source.info.retryAfterUntil = new Date(
          Date.now() +
            Math.min(
              lastErrorInfo.retryAfterSeconds * 1000,
              config.SOURCE_BACKOFF_MAX,
            ),
        );
      }
      if (
        !source.info.autoDisabled &&
        SourceShouldAutoDisable(fetchErrorCount, config.SOURCE_DISABLE_THRESHOLD)
      ) {
        source.info.autoDisabled = true;
        source.info.autoDisabledDate = new Date();
        source.info.autoDisabledReason = source.info.lastFetchError;
        logger.warn(
          `Source ${source.id} (${source.name}) auto-disabled after ${fetchErrorCount} consecutive fetch errors: ${source.info.lastFetchError}`,
          context,
        );
      }
      await SourcesDataUpdate(context, source);
      logger.warn(
        `No processor found for ${source.id} (${source.name})`,
        context,
      );
    } else {
      const updatedState = sourceContext.getUpdatedState();
      if (updatedState) {
        try {
          await SourcesFetchStateDataSave(context, source.id, updatedState);
        } catch (err) {
          logger.warn(
            `Failed to save fetch state for source ${source.id}: ${err.message}`,
            context,
          );
        }
      }
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

// Loads a processor script. The files are CommonJS, but under ESM runtimes
// (tsx) the dynamic import exposes them only through `default`; under the
// compiled CJS build the exports are the module itself.
async function ProcessorsLoadFile(processorsFile: any): Promise<any> {
  const mod: any = await import(processorsFile.path);
  const processor = mod?.default ?? mod;
  if (!processor || typeof processor.test !== "function") {
    throw new Error(
      `Processor ${processorsFile.name} does not export test()/fetchLatest()`,
    );
  }
  return processor;
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
