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

function buildService {
    SERVICE_BASE_NAME=${1}
    SERVICE_NAME="telepathy-${1}"
    OS_VARIANT=${2}
    DEFAULT_TAG=${3}
    SERVICE_VERSION=$(cat ${REPO_DIR}/${SERVICE_NAME}/package.json | jq -r '.version')
    SERVICE_VERSION_MAJOR=$(cat ${REPO_DIR}/${SERVICE_NAME}/package.json | grep \"version\" | cut -f4 -d"\"" | cut -f1 -d".")
    SERVICE_VERSION_MINOR=$(cat ${REPO_DIR}/${SERVICE_NAME}/package.json | grep \"version\" | cut -f4 -d"\"" | cut -f1-2 -d".")
    
    echo "Publishing ${SERVICE_NAME}/${SERVICE_VERSION}/${SERVICE_VERSION_MAJOR}/${SERVICE_VERSION_MINOR} - ${OS_VARIANT} - ${TAG}"

    tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT}
    tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION_MAJOR}-${OS_VARIANT}
    tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION_MINOR}-${OS_VARIANT}
    tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${OS_VARIANT}
    if [ "${DEFAULT_TAG}" == "Y" ]; then
        tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}
        tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION_MAJOR}
        tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION_MINOR}
        tagAndPush didierhoarau/telepathy-${SERVICE_BASE_NAME}:${SERVICE_VERSION}-${OS_VARIANT} didierhoarau/telepathy-${SERVICE_BASE_NAME}
    fi

}


buildService agent alpine Y
buildService agent ubuntu
buildService server alpine Y
buildService server ubuntu
buildService web alpine Y
