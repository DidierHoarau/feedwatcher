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
import { Scheduler } from "./processors/scheduler";
import { SourceIditemsRoutes } from "./routes/SourceIdItemsRoutes";

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
  // fastify.register(new UserIdRoutes().getRoutes, {
  //   prefix: "/api/users/:userId",
  // });

  fastify.register(new SourcesRoutes().getRoutes, {
    prefix: "/api/sources",
  });
  fastify.register(new SourceIditemsRoutes().getRoutes, {
    prefix: "/api/sources/:sourceId/items",
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
