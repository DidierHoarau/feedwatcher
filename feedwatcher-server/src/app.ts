import Fastify from "fastify";
import * as path from "path";
import { watchFile } from "fs-extra";
import { Config } from "./Config";
import { Logger } from "./utils-std-ts/Logger";
import { UsersRoutes } from "./users/UsersRoutes";
import { Auth } from "./users/Auth";
import { StandardTracerApi } from "./StandardTracerApi";
import { Scheduler } from "./Scheduler";
import { ItemsRoutes } from "./sources/ItemsRoutes";
import { ProcessorsRoutes } from "./procesors/ProcessorsRoutes";
import { RulesRoutes } from "./rules/RulesRoutes";
import { SourcesRoutes } from "./sources/SourcesRoutes";
import { SourcesIdRoutes } from "./sources/SourcesIdRoutes";
import { SourcesLabelsRoutes } from "./sources/SourcesLabelsRoutes";
import { SourcesImportRoutes } from "./sources/SourcesImportRoutes";
import { ListsItemsRoutes } from "./sources/ListsItemsRoutes";
import { StandardTracerInitTelemetry, StandardTracerStartSpan } from "./utils-std-ts/StandardTracer";
import { ProcessorsInit } from "./procesors/Processors";
import { SqlDbUtilsInit } from "./utils-std-ts/SqlDbUtils";

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

  const span = StandardTracerStartSpan("init");

  await SqlDbUtilsInit(span, config);
  await Auth.init(span, config);
  await ProcessorsInit(span, config);
  await Scheduler.init(span, config);

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

  StandardTracerApi.registerHooks(fastify, config);

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

  /* eslint-disable-next-line */
  fastify.register(require("@fastify/static"), {
    root: path.join(__dirname, "../web"),
    prefix: "/",
  });

  fastify.listen({ port: config.API_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
      logger.error(err);
      fastify.log.error(err);
      process.exit(1);
    }
    logger.info("API Listerning");
  });
});
