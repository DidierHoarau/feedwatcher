import Fastify from "fastify";
import { watchFile } from "fs-extra";
import * as path from "path";
import { Config } from "./Config";
import { ProcessorsInit } from "./procesors/Processors";
import { ProcessorsRoutes } from "./procesors/ProcessorsRoutes";
import { RulesRoutes } from "./rules/RulesRoutes";
import { SchedulerInit } from "./Scheduler";
import { ItemsRoutes } from "./sources/ItemsRoutes";
import { ListsItemsRoutes } from "./sources/ListsItemsRoutes";
import { SourcesIdRoutes } from "./sources/SourcesIdRoutes";
import { SourcesImportRoutes } from "./sources/SourcesImportRoutes";
import { SourcesLabelsRoutes } from "./sources/SourcesLabelsRoutes";
import { SourcesRoutes } from "./sources/SourcesRoutes";
import { StandardTracerApiRegisterHooks } from "./StandardTracerApi";
import { AuthInit } from "./users/Auth";
import { UsersRoutes } from "./users/UsersRoutes";
import { Logger } from "./utils-std-ts/Logger";
import { SqlDbUtilsInit } from "./utils-std-ts/SqlDbUtils";
import { StandardMeterInitTelemetry } from "./utils-std-ts/StandardMeter";
import {
  StandardTracerInitTelemetry,
  StandardTracerStartSpan,
} from "./utils-std-ts/StandardTracer";

const logger = new Logger("app");

logger.info("====== Starting FeedWatcher Server ======");

Promise.resolve().then(async () => {
  //
  const config = new Config();
  await config.reload();
  watchFile(config.CONFIG_FILE, () => {
    logger.info(`Config updated: ${config.CONFIG_FILE}`);
    config.reload();
  });

  StandardTracerInitTelemetry(config);
  StandardMeterInitTelemetry(config);

  const span = StandardTracerStartSpan("init");

  await SqlDbUtilsInit(span, config);
  await AuthInit(span, config);
  await ProcessorsInit(span, config);
  await SchedulerInit(span, config);

  span.end();

  // API

  const fastify = Fastify({
    logger: config.LOG_LEVEL === "debug_tmp",
    ignoreTrailingSlash: true,
  });

  if (config.CORS_POLICY_ORIGIN) {
    /* eslint-disable-next-line */
    fastify.register(require("@fastify/cors"), {
      origin: config.CORS_POLICY_ORIGIN,
      methods: "GET,PUT,POST,DELETE",
    });
  }
  /* eslint-disable-next-line */
  fastify.register(require("@fastify/multipart"));

  StandardTracerApiRegisterHooks(fastify, config);

  fastify.register(new UsersRoutes().getRoutes, {
    prefix: "/api/users",
  });
  fastify.register(new SourcesRoutes().getRoutes, {
    prefix: "/api/sources",
  });
  fastify.register(new ItemsRoutes().getRoutes, {
    prefix: "/api/items",
  });
  fastify.register(new SourcesIdRoutes().getRoutes, {
    prefix: "/api/sources/:sourceId",
  });
  fastify.register(new SourcesLabelsRoutes().getRoutes, {
    prefix: "/api/sources/labels",
  });
  fastify.register(new SourcesImportRoutes().getRoutes, {
    prefix: "/api/sources/import",
  });
  fastify.register(new ListsItemsRoutes().getRoutes, {
    prefix: "/api/lists",
  });
  fastify.register(new ProcessorsRoutes().getRoutes, {
    prefix: "/api/processors",
  });
  fastify.register(new RulesRoutes().getRoutes, {
    prefix: "/api/rules",
  });
  fastify.get("/api/status", async () => {
    return { started: true };
  });

  /* eslint-disable-next-line */
  fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "../web"),
    prefix: "/",
  });

  fastify.listen({ port: config.API_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
      logger.error(err);
      process.exit(1);
    }
    logger.info("API Listerning");
  });
});
