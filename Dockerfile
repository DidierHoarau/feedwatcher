# BUILD
FROM node:18-alpine as builder

RUN apk add --no-cache bash git python3 perl alpine-sdk

WORKDIR /opt/app

COPY feedwatcher-server feedwatcher-server
COPY feedwatcher-web feedwatcher-web
COPY feedwatcher-proxy feedwatcher-server
COPY ecosystem.config.json ecosystem.config
COPY _dev/entrypoint.sh entrypoint.sh

RUN ls -l && \
    npm install -g pm2 && \
    cd /opt/app/feedwatcher-server && \
    npm ci && \
    npm build
    cd /opt/app/feedwatcher-web && \
    npm ci && \
    npm build

CMD [ "/opt/app/entrypoint.sh" ]
