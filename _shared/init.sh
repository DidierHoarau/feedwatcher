#!/bin/bash

rm -fr ../telepathy-server/src/utils-std-ts
rm -fr ../telepathy-server/src/common-model
cp -R utils-std-ts ../telepathy-server/src/utils-std-ts
cp -R common-model ../telepathy-server/src/common-model

rm -fr ../telepathy-agent/src/utils-std-ts
rm -fr ../telepathy-agent/src/common-model
cp -R utils-std-ts ../telepathy-agent/src/utils-std-ts
cp -R common-model ../telepathy-agent/src/common-model
