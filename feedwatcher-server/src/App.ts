import { StandardMeter, StandardTracer } from "@devopsplaybook.io/otel-utils";
import { StandardTracerFastifyRegisterHooks } from "@devopsplaybook.io/otel-utils-fastify";
import cors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { watchFile } from "fs-extra";
import * as path from "path";
import { Config } from "./Config";
import {
  OTelLogger,
  OTelSetMeter,
  OTelSetTracer,
  OTelTracer,
} from "./OTelContext";
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
import { AuthInit } from "./users/Auth";
import { UsersRoutes } from "./users/UsersRoutes";
import { SqlDbUtilsInit } from "./utils-std-ts/SqlDbUtils";

const logger = OTelLogger().createModuleLogger("app");

logger.info("====== Starting FeedWatcher Server ======");

Promise.resolve().then(async () => {
  //
  const config = new Config();
  await config.reload();
  watchFile(config.CONFIG_FILE, () => {
    logger.info(`Config updated: ${config.CONFIG_FILE}`);
    config.reload();
  });

  OTelSetTracer(new StandardTracer(config));
  OTelSetMeter(new StandardMeter(config));
  OTelLogger().initOTel(config);

  const span = OTelTracer().startSpan("init");

  await SqlDbUtilsInit(span, config);
  await AuthInit(span, config);
  await ProcessorsInit(span, config);
  await SchedulerInit(span, config);

  span.end();

  // API

  const fastify = Fastify({});

  if (config.CORS_POLICY_ORIGIN) {
    fastify.register(cors, {
      origin: config.CORS_POLICY_ORIGIN,
      methods: "GET,PUT,POST,DELETE",
    });
  }
  fastify.register(fastifyMultipart);

  StandardTracerFastifyRegisterHooks(fastify, OTelTracer(), OTelLogger(), {
    ignoreList: ["GET-/api/status"],
  });

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

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, "../web"),
    prefix: "/",
  });

  fastify.listen({ port: config.API_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
      logger.error(err);
      process.exit(1);
    }
    logger.info("API Listening");
  });
});
