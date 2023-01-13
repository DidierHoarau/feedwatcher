#!/bin/bash

set -e

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd ${REPO_DIR}

function tagAndPush {
    IMAGE_BASE=${1}
    IMAGE_TARGET=${2}
    docker tag ${IMAGE_BASE} ${IMAGE_TARGET}
    docker push ${IMAGE_TARGET}
}

SERVICE_NAME="feedwatcher"
SERVICE_VERSION=$(cat ${REPO_DIR}/package.json | jq -r '.version')
SERVICE_VERSION_MAJOR=$(cat ${REPO_DIR}/package.json | grep \"version\" | cut -f4 -d"\"" | cut -f1 -d".")
SERVICE_VERSION_MINOR=$(cat ${REPO_DIR}/package.json | grep \"version\" | cut -f4 -d"\"" | cut -f1-2 -d".")

echo "Publishing ${SERVICE_NAME}/${SERVICE_VERSION}/${SERVICE_VERSION_MAJOR}/${SERVICE_VERSION_MINOR}"

tagAndPush didierhoarau/feedwatcher:${SERVICE_VERSION} didierhoarau/feedwatcher:${SERVICE_VERSION}
tagAndPush didierhoarau/feedwatcher:${SERVICE_VERSION} didierhoarau/feedwatcher:${SERVICE_VERSION_MAJOR}
tagAndPush didierhoarau/feedwatcher:${SERVICE_VERSION} didierhoarau/feedwatcher:${SERVICE_VERSION_MINOR}
