#!/bin/bash

set -e

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

pm2 delete all || true


# Monitoring
cd "${REPO_DIR}/_dev/monitoring"
docker compose down || true
docker compose up -d || true


# Server
cd "${REPO_DIR}/telepathy-server"
if [ ! -f package-lock.json ]; then
    rm -fr node_modules
    npm install
fi
if [ ! -d node_modules ]; then
    npm ci
fi

# Agent
cd "${REPO_DIR}/telepathy-agent"
if [ ! -f package-lock.json ]; then
    rm -fr node_modules
    npm install
fi
if [ ! -d node_modules ]; then
    npm ci
fi

# Web
cd "${REPO_DIR}/telepathy-web"
if [ ! -f package-lock.json ]; then
    rm -fr node_modules
    npm install
fi
if [ ! -d node_modules ]; then
    npm ci
fi

# Start
cd "${REPO_DIR}"
pm2 start ecosystem.config.js --env development
pm2 logs
