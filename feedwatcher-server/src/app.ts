import Fastify from "fastify";
import * as path from "path";
import { watchFile } from "fs-extra";
import { Config } from "./Config";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { UsersRoutes } from "./routes/UsersRoutes";
import { Auth } from "./data/Auth";
import { StandardTracerApi } from "./StandardTracerApi";
import { SqlDbutils } from "./data/SqlDbUtils";
import { SourcesRoutes } from "./routes/SourcesRoutes";
import { Scheduler } from "./scheduler";
import { SourcesIdRoutes } from "./routes/SourcesIdRoutes";
import { Processors } from "./procesors/processors";
import { SourcesLabelsRoutes } from "./routes/SourcesLabelsRoutes";
import { ListsItemsRoutes } from "./routes/ListsItemsRoutes";
import { ItemsRoutes } from "./routes/ItemsRoutes";
import { ProcessorsRoutes } from "./routes/ProcessorsRoutes";

const logger = new Logger("app");

logger.info("====== Starting Telepathy Server ======");

Promise.resolve().then(async () => {
  //
  const config = new Config();
  await config.reload();
  watchFile(config.CONFIG_FILE, () => {
    logger.info(`Config updated: ${config.CONFIG_FILE}`);
    config.reload();
  });

  StandardTracer.initTelemetry(config);

  const span = StandardTracer.startSpan("init");

  await SqlDbutils.init(span, config);
  await Auth.init(span, config);
  await Processors.init(span, config);
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
  fastify.register(new ListsItemsRoutes().getRoutes, {
    prefix: "/api/lists",
  });
  fastify.register(new ProcessorsRoutes().getRoutes, {
    prefix: "/api/processors",
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
