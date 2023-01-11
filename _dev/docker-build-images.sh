#!/bin/bash

set -e

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd ${REPO_DIR}

function buildService {
    SERVICE_BASE_NAME=${1}
    SERVICE_NAME="telepathy-${1}"
    OS_VARIANT=${2}
    SERVICE_VERSION=$(cat ${REPO_DIR}/${SERVICE_NAME}/package.json | jq -r '.version')
    echo "Building ${SERVICE_NAME}/${SERVICE_VERSION} - ${OS_VARIANT}"
    docker build -f Dockerfile-${SERVICE_BASE_NAME}-${OS_VARIANT} -t didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} .
}


buildService agent alpine
buildService agent ubuntu
buildService server alpine
buildService server ubuntu
buildService web alpine
