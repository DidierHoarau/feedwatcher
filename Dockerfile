# BUILD
FROM node:18-alpine as builder

WORKDIR /opt/app

COPY feedwatcher-server feedwatcher-server
COPY feedwatcher-web feedwatcher-web
COPY feedwatcher-proxy feedwatcher-proxy
COPY ecosystem.config.js .
COPY _dev/entrypoint.sh .

RUN ls -l && \
    apk add --no-cache bash git python3 perl alpine-sdk && \
    npm install -g pm2 && \
    cd /opt/app/feedwatcher-server && \
    npm ci && \
    npm run build && \
    cd /opt/app/feedwatcher-web && \
    npm ci && \
    npm run build

CMD [ "/opt/app/entrypoint.sh" ]
