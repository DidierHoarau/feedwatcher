<script setup>
function updateAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

onMounted(() => {
  updateAppHeight();
  window.addEventListener("resize", updateAppHeight);
  window.visualViewport?.addEventListener("resize", updateAppHeight);

  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", updateAppHeight);
  window.visualViewport?.removeEventListener("resize", updateAppHeight);
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

header {
  border-bottom: 1px solid var(--color-border-light);
  box-shadow: 0 1px 3px var(--color-shadow-sm);
  position: relative;
  z-index: 10;
  background: var(--color-bg);
}

/* Global smooth transitions for interactive elements */
a,
button,
input,
select {
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}
</style>
