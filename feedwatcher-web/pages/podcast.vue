<template>
  <div class="podcast-player-page">
    <div class="podcast-player-header">
      <button class="podcast-back-btn outline secondary" v-on:click="goBack()">
        <i class="bi bi-arrow-left"></i>
      </button>
      <span class="podcast-header-title">Now Playing</span>
    </div>

    <div v-if="loading" class="loading-indicator"></div>

    <div v-else-if="item" class="podcast-player-body">
      <div class="podcast-artwork-container">
        <img
          v-if="artwork"
          :src="artwork"
          :alt="item.title"
          class="podcast-artwork"
        />
        <div v-else class="podcast-artwork-placeholder">
          <i class="bi bi-headphones"></i>
        </div>
      </div>

      <div class="podcast-info">
        <h3 class="podcast-title">{{ item.title }}</h3>
        <p v-if="item.sourceName" class="podcast-source">
          {{ item.sourceName }}
        </p>
        <p v-if="item.info?.author" class="podcast-author">
          {{ item.info.author }}
        </p>
        <p v-if="item.info?.subtitle" class="podcast-subtitle">
          {{ item.info.subtitle }}
        </p>
      </div>

      <div class="podcast-timeline">
        <span class="podcast-time">{{ playerStore.formattedCurrentTime }}</span>
        <input
          type="range"
          class="podcast-scrubber"
          min="0"
          :max="playerStore.duration || 0"
          :value="playerStore.currentTime"
          step="1"
          v-on:input="onScrub($event)"
        />
        <span class="podcast-time">{{ playerStore.formattedDuration }}</span>
      </div>

      <div class="podcast-controls">
        <button
          class="podcast-ctrl-btn outline secondary"
          v-on:click="playerStore.skipBackward(30)"
          title="Rewind 30 seconds"
        >
          <i class="bi bi-skip-backward-fill"></i>
        </button>

        <button
          class="podcast-ctrl-btn outline secondary"
          v-on:click="handlePlayPause()"
          :title="playerStore.isPlaying ? 'Pause' : 'Play'"
        >
          <i
            :class="
              playerStore.isPlaying
                ? 'bi bi-pause-circle-fill'
                : 'bi bi-play-circle-fill'
            "
          ></i>
        </button>

        <button
          class="podcast-ctrl-btn outline secondary"
          v-on:click="playerStore.skipForward(30)"
          title="Forward 30 seconds"
        >
          <i class="bi bi-skip-forward-fill"></i>
        </button>

        <button
          class="podcast-ctrl-btn outline secondary"
          v-on:click="stopPlayback()"
          title="Stop and clear"
        >
          <i class="bi bi-stop-circle-fill"></i>
        </button>
      </div>
    </div>

    <div v-else class="podcast-no-item">
      <i class="bi bi-headphones"></i>
      <p>No episode selected</p>
    </div>
  </div>
</template>

<script setup>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";

const playerStore = PodcastPlayerStore();
const route = useRoute();
const router = useRouter();

const item = ref(null);
const loading = ref(true);

const artwork = computed(() => {
  return item.value?.info?.artwork || item.value?.thumbnail || null;
});

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push("/");
  }
}

function onScrub(event) {
  const value = parseFloat(event.target.value);
  playerStore.seek(value);
}

function handlePlayPause() {
  if (playerStore.isPlaying) {
    playerStore.pause();
  } else if (item.value?.info?.audioUrl) {
    playerStore.play(item.value);
  }
}

function stopPlayback() {
  playerStore.stop();
  item.value = null;
}

onMounted(async () => {
  const itemId = route.query.itemId;
  if (!itemId) {
    if (playerStore.currentItem) {
      item.value = playerStore.currentItem;
    }
    loading.value = false;
    return;
  }

  if (playerStore.currentItem?.id === itemId) {
    item.value = playerStore.currentItem;
    loading.value = false;
    return;
  }

  try {
    const res = await axios.get(
      `${(await Config.get()).SERVER_URL}/items/${itemId}`,
      await AuthService.getAuthHeader(),
    );
    item.value = res.data;
    if (item.value?.info?.audioUrl) {
      playerStore.play(item.value);
    }
  } catch (err) {
    console.error("Failed to load podcast item", err);
  }
  loading.value = false;
});
</script>

<style scoped>
.podcast-player-page {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-base);
}

.podcast-player-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding-bottom: var(--space-md);
}

.podcast-back-btn {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-lg);
}

.podcast-header-title {
  font-size: var(--font-xl);
  font-weight: 600;
}

.podcast-player-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl) var(--space-base);
  max-width: 32em;
  margin: 0 auto;
  width: 100%;
}

.podcast-artwork-container {
  width: min(20em, 60vw);
  aspect-ratio: 1;
  flex-shrink: 0;
}

.podcast-artwork {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 24px var(--color-shadow-lg);
}

.podcast-artwork-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  font-size: 6em;
  color: var(--color-text-muted);
}

.podcast-info {
  text-align: center;
  width: 100%;
}

.podcast-title {
  margin: 0 0 var(--space-xs) 0;
  font-size: var(--font-xl);
  font-weight: 600;
  line-height: 1.3;
}

.podcast-source {
  margin: 0;
  font-size: var(--font-base);
  color: var(--color-text-muted);
}

.podcast-author {
  margin: var(--space-xs) 0 0 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.podcast-subtitle {
  margin: var(--space-sm) 0 0 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.podcast-timeline {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-sm);
  align-items: center;
  width: 100%;
}

.podcast-time {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  min-width: 3.5em;
  text-align: center;
}

.podcast-scrubber {
  width: 100%;
  height: 6px;
  cursor: pointer;
  accent-color: var(--color-primary);
  margin: 0;
}

.podcast-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
}

.podcast-ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  padding: 0;
  font-size: var(--font-xl);
  cursor: pointer;
}

.podcast-ctrl-btn i {
  font-size: 1.4em;
}

.podcast-no-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  color: var(--color-text-muted);
  font-size: 4em;
  padding: var(--space-3xl);
}

.podcast-no-item p {
  font-size: var(--font-base);
  margin: 0;
}
</style>
