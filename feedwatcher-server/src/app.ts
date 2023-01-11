import Fastify from "fastify";
import { watchFile } from "fs-extra";
import { Agent } from "./common-model/Agent";
import { Config } from "./Config";
import { AgentsData } from "./data/AgentsData";
import { Scheduler } from "./process/Scheduler";
import { TaskCleanup } from "./process/TaskCleanup";
import { TaskExecutionsData } from "./data/TaskExecutionsData";
import { TasksData } from "./data/TasksData";
import { UsersData } from "./data/UsersData";
import { Logger } from "./utils-std-ts/Logger";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { TasksRoutes } from "./routes/TasksRoutes";
import { AgentsRoutes } from "./routes/AgentsRoutes";
import { UserRoutes } from "./routes/UsersRoutes";
import { TaskIdRoutes } from "./routes/TaskIdRoutes";
import { AgentIdRoutes } from "./routes/AgentIdRoutes";
import { TasksExecutuionsRoutes } from "./routes/TasksExecutionsRoutes";
import { TasksExecutionsForAgentsRoutes } from "./routes/TasksExecutionsForAgentsRoutes";
import { UserIdRoutes } from "./routes/UserIdRoutes";
import { TasksWebhooksRoutes } from "./routes/TasksWebhooksRoutes";
import { TasksExecutionIdRoutes } from "./routes/TasksExecutionIdRoutes";
import { FileDBUtils } from "./data/FileDbUtils";
import { Auth } from "./data/Auth";
import { StandardTracerApi } from "./StandardTracerApi";

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

  FileDBUtils.init(config);
  Auth.init(config);

  const usersData = new UsersData();
  await usersData.load(span);

  const tasksData = new TasksData();
  await tasksData.load(span);

  const taskExecutionsData = new TaskExecutionsData(config, tasksData);
  await taskExecutionsData.load(span);

  const registeredAgents: Agent[] = [];
  const agentsData = new AgentsData(config, registeredAgents);
  agentsData.waitRegistrations();

  const scheduler = new Scheduler(tasksData, taskExecutionsData);
  scheduler.calculate(span);

  const taskCleanup = new TaskCleanup(config, tasksData, taskExecutionsData);
  taskCleanup.startMaintenance();
  taskCleanup.monitorTimeouts();

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

  fastify.register(new AgentsRoutes(agentsData).getRoutes, { prefix: "/agents" });
  fastify.register(new AgentIdRoutes(config, agentsData, taskExecutionsData).getRoutes, { prefix: "/agents/:agentId" });
  fastify.register(new TasksRoutes(tasksData, scheduler).getRoutes, { prefix: "/tasks" });
  fastify.register(new TaskIdRoutes(tasksData, scheduler).getRoutes, { prefix: "/tasks/:taskId" });
  fastify.register(new TasksExecutuionsRoutes(taskExecutionsData).getRoutes, { prefix: "/tasks/:taskId/executions" });
  fastify.register(new TasksExecutionsForAgentsRoutes(taskExecutionsData).getRoutes, {
    prefix: "/tasks/:taskId/executions/agent",
  });
  fastify.register(new TasksExecutionIdRoutes(taskExecutionsData).getRoutes, {
    prefix: "/tasks/:taskId/executions/:taskExecutionId",
  });
  fastify.register(new TasksWebhooksRoutes(tasksData, taskExecutionsData).getRoutes, { prefix: "/tasks/webhooks" });
  fastify.register(new UserRoutes(usersData).getRoutes, { prefix: "/users" });
  fastify.register(new UserIdRoutes(usersData).getRoutes, { prefix: "/users/:userId" });

  fastify.listen({ port: config.API_PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
      logger.error(err);
      fastify.log.error(err);
      process.exit(1);
    }
    logger.info("API Listerning");
  });
});
