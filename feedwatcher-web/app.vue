<script setup>
import { EventBus, EventTypes } from "~~/services/EventBus";

const showSourceDialog = ref(false);
const dialogItem = ref(null);

function updateAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

onMounted(() => {
  updateAppHeight();
  window.addEventListener("resize", updateAppHeight);
  window.visualViewport?.addEventListener("resize", updateAppHeight);

  // Register service worker (only in production)
  if (!import.meta.dev && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  }

  // Listen for open item events
  EventBus.on(EventTypes.OPEN_ITEM, (item) => {
    dialogItem.value = item;
    showSourceDialog.value = true;
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", updateAppHeight);
  window.visualViewport?.removeEventListener("resize", updateAppHeight);
  EventBus.off(EventTypes.OPEN_ITEM);
});
</script>

<template>
  <div id="page-layout">
    <header>
      <Navigation />
    </header>
    <main>
      <NuxtPage />
    </main>
    <AlertMessages id="page-alert-messages" />
    <SourceDialog v-model="showSourceDialog" :item="dialogItem" />
  </div>
</template>

<style>
/* Layout */

#page-layout {
  height: var(--app-height, 100dvh);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden !important;
  width: 100vw;
}

header,
main {
  padding: var(--space-sm);
  overflow: hidden;
}
</style>
