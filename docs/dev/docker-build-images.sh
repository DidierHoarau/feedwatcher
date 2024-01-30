#!/bin/bash

set -e

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
cd ${REPO_DIR}

SERVICE_NAME="feedwatcher"
SERVICE_VERSION=$(cat ${REPO_DIR}/package.json | jq -r '.version')
echo "Building ${SERVICE_NAME}/${SERVICE_VERSION}"
docker buildx build \
  --platform linux/arm64/v8,linux/amd64 \
  -f Dockerfile \
  -t didierhoarau/${SERVICE_NAME}:${SERVICE_VERSION} .
docker buildx build \
  --load \
  -t didierhoarau/${SERVICE_NAME}:${SERVICE_VERSION} \
  --builder=container .