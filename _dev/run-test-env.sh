#!/bin/bash

set -e

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

pm2 delete all || true

if [ ! -f ${REPO_DIR}/_dev/data/users.json ]; then
    echo '[{"id":"f501026b-71ad-4553-8c46-2ebed421b533","name":"admin","passwordEncrypted":"$2b$10$vNfwGbp2F2wooiz3HAlCguP3Oin9GyPB/DXDZycuyoPTm9mCZti3G"}]' > ${REPO_DIR}/_dev/data/users.json
fi

# Server
cd "${REPO_DIR}/telepathy-server"
if [ ! -d node_modules ]; then
    npm ci
fi

# Agent
cd "${REPO_DIR}/telepathy-agent"
if [ ! -d node_modules ]; then
    npm ci
fi

# Web
cd "${REPO_DIR}/telepathy-web"
if [ ! -d node_modules ]; then
    npm ci
fi

# Start
cd "${REPO_DIR}"
pm2 start ecosystem.config.js --env development
