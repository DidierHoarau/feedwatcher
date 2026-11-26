<template>
  <AppUpdateNotice :visible="updateAvailable" @reload="onReload" @later="dismiss" />
</template>

<script setup>
import { watch } from "vue";
import AppUpdateNotice from "@devopsplaybook.io/common-web/components/AppUpdateNotice.vue";
import { useAppUpdate } from "@devopsplaybook.io/common-web/composables/useAppUpdate";
import { createBuildVersionProbe } from "@devopsplaybook.io/common-web/services/BuildVersionProbe";

const config = useRuntimeConfig();

const { updateAvailable, reload, dismiss } = useAppUpdate({
  currentBuildId: String(config.app.buildId ?? ""),
  fetchLatestBuildId: createBuildVersionProbe(),
});

// A new build ships a new sw.js: fetch it so the reload uses the new worker.
watch(updateAvailable, (available) => {
  if (available) void refreshServiceWorker();
});

async function refreshServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  } catch {
    // Best effort: the reload still serves the freshest build.
  }
}

function onReload() {
  void reload();
}
</script>
