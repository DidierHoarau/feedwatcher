#!/bin/bash

cd /opt/app

pm2 start ecosystem.config.js --env development
