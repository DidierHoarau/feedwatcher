module.exports = {
  apps: [
    {
      name: "feedwatcher-proxy",
      cwd: "feedwatcher-proxy",
      script: "npm",
      args: "run start",
      autorestart: false,
      ignore_watch: ["node_modules"],
    },
    {
      name: "feedwatcher-server",
      cwd: "feedwatcher-server",
      script: "npm",
      args: "run dev",
      autorestart: false,
      env_development: {
        DEV_MODE: "true",
        DATA_DIR: "../docs/dev/data",
        OPENTELEMETRY_COLLECTOR_HTTP: "http://localhost:4318/v1/traces",
        OPENTELEMETRY_COLLECTOR_AWS: true,
      },
    },
    {
      name: "feedwatcher-web",
      cwd: "feedwatcher-web",
      script: "npm",
      args: "run dev",
      autorestart: false,
      env_development: {
        DEV_MODE: "true",
      },
    },
  ],
};
