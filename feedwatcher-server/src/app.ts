import Fastify from "fastify";
import * as path from "path";
import { watchFile } from "fs-extra";
import { Config } from "./Config";
import { UsersData } from "./data/UsersData";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { UserRoutes } from "./routes/UsersRoutes";
import { UserIdRoutes } from "./routes/UserIdRoutes";
import { FileDBUtils } from "./data/FileDbUtils";
import { Auth } from "./data/Auth";
import { StandardTracerApi } from "./StandardTracerApi";
import { SqlDbutils } from "./data/SqlDbUtils";
import { SourceRoutes } from "./routes/SourcesRoutes";

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

  SqlDbutils.init(span, config);
  FileDBUtils.init(config);
  Auth.init(config);

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

  fastify.register(new UserRoutes().getRoutes, {
    prefix: "/api/users",
  });
  // fastify.register(new UserIdRoutes().getRoutes, {
  //   prefix: "/api/users/:userId",
  // });

  fastify.register(new SourceRoutes().getRoutes, {
    prefix: "/api/sources",
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
