<script setup>
import { EventBus, EventTypes } from "~~/services/EventBus";

const showSourceDialog = ref(false);
const dialogItem = ref(null);
const playerStore = PodcastPlayerStore();

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

function openPodcastPage() {
  if (playerStore.currentItem) {
    useRouter().push({
      path: "/podcast",
      query: { itemId: playerStore.currentItem.id },
    });
  }
}
</script>

<template>
  <div
    id="page-layout"
    :class="{ 'has-mini-player': playerStore.hasActiveItem }"
  >
    <header>
      <Navigation />
    </header>
    <main>
      <NuxtPage />
    </main>
    <AlertMessages id="page-alert-messages" />
    <SourceDialog v-model="showSourceDialog" :item="dialogItem" />

    <!-- Mini Player Bar -->
    <div
      v-if="playerStore.hasActiveItem"
      class="mini-player"
      v-on:click="openPodcastPage()"
    >
      <img
        v-if="
          playerStore.currentItem?.info?.artwork ||
          playerStore.currentItem?.thumbnail
        "
        :src="
          playerStore.currentItem?.info?.artwork ||
          playerStore.currentItem?.thumbnail
        "
        class="mini-player-artwork"
        alt=""
      />
      <div class="mini-player-info">
        <div class="mini-player-title">
          {{ playerStore.currentItem?.title }}
        </div>
        <div class="mini-player-progress-bar">
          <div
            class="mini-player-progress-fill"
            :style="{ width: playerStore.progressPercent + '%' }"
          ></div>
        </div>
      </div>
      <button
        class="mini-player-play-btn"
        v-on:click.stop="playerStore.togglePlayPause()"
      >
        <i
          :class="
            playerStore.isPlaying ? 'bi bi-pause-fill' : 'bi bi-play-fill'
          "
        ></i>
      </button>
    </div>
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

#page-layout.has-mini-player {
  grid-template-rows: auto 1fr auto;
}

header,
main {
  padding: var(--space-sm);
  overflow: hidden;
}

/* Mini Player */
.mini-player {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  background-color: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  cursor: pointer;
  min-height: 3rem;
}

.mini-player:hover {
  background-color: var(--color-bg-hover);
}

.mini-player-artwork {
  width: 2.4rem;
  height: 2.4rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.mini-player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mini-player-title {
  font-size: var(--font-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-player-progress-bar {
  height: 3px;
  background-color: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}

.mini-player-progress-fill {
  height: 100%;
  background-color: var(--color-primary);
  transition: width 0.25s linear;
}

.mini-player-play-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.8rem;
  color: var(--color-primary);
  padding: 0 var(--space-xs);
  line-height: 1;
  flex-shrink: 0;
}

.mini-player-play-btn:hover {
  color: var(--color-primary-hover);
}
</style>
