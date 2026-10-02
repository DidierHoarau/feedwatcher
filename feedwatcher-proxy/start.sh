#!/bin/bash

SERVICE_DIR="$( cd "$( dirname "$0" )" && pwd )"
cd ${SERVICE_DIR}

TRAEFIK_VERSION="v2.9.6"
TRAEFIK_ARCHIVE="traefik_${TRAEFIK_VERSION}_linux_amd64.tar.gz"
# Pinned checksum from traefik_v2.9.6_checksums.txt (official release assets).
TRAEFIK_SHA256="9aabb29a10ac051161fe286cdaa5c336073f08f2298fb994dc4f0a5328e21f2f"

if [ ! -d bin ]; then
    mkdir -p bin
    cd bin
    wget https://github.com/traefik/traefik/releases/download/${TRAEFIK_VERSION}/${TRAEFIK_ARCHIVE}
    echo "${TRAEFIK_SHA256}  ${TRAEFIK_ARCHIVE}" | sha256sum -c -
    tar -xzf ${TRAEFIK_ARCHIVE}
    cd ..
fi

cd ${SERVICE_DIR}
./bin/traefik \
    --entryPoints.web.address=:9009 \
    --entryPoints.websecure.address=:9008 \
    --providers.file.watch=true \
    --providers.file.filename=traefik-rules.yml \
    --entrypoints.dashboard.address=:9091 \
    --api=true \
    --api.dashboard=true