# BUILD
FROM node:22-alpine as builder

WORKDIR /opt/src

RUN apk add --no-cache bash git python3 perl alpine-sdk

COPY feedwatcher-server feedwatcher-server

RUN cd feedwatcher-server && \
    npm ci && \
    npm run build

COPY feedwatcher-web feedwatcher-web

RUN cd feedwatcher-web && \
    npm ci && \
    npm run generate

# RUN
FROM node:22-alpine

COPY --from=builder /opt/src/feedwatcher-server/node_modules /opt/app/feedwatcher/node_modules
COPY --from=builder /opt/src/feedwatcher-server/dist /opt/app/feedwatcher/dist
COPY --from=builder /opt/src/feedwatcher-web/.output/public /opt/app/feedwatcher/web
COPY feedwatcher-server/config.json /opt/app/feedwatcher/config.json
COPY feedwatcher-server/sql /opt/app/feedwatcher/sql
COPY feedwatcher-server/processors-system /opt/app/feedwatcher/processors-system
COPY feedwatcher-server/processors-user /opt/app/feedwatcher/processors-user
COPY package.json /opt/app/feedwatcher/package.json

WORKDIR /opt/app/feedwatcher

CMD [ "dist/App.js" ]