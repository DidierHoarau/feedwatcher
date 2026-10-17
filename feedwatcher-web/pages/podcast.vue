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

      <p v-if="resumeHintVisible" class="podcast-resume-hint">
        <i class="bi bi-clock-history"></i>
        Resumes from {{ formatTime(item.playbackPositionSeconds) }}
      </p>

      <div class="podcast-controls">
        <button
          class="podcast-ctrl-btn outline secondary"
          v-on:click="playerStore.skipBackward(30)"
          title="Rewind 30 seconds"
        >
          <i class="bi bi-skip-backward-fill"></i>
        </button>

        <button
          class="podcast-ctrl-btn podcast-speed-btn outline secondary"
          v-on:click="playerStore.cyclePlaybackRate()"
          title="Playback speed"
          aria-label="Playback speed"
        >
          <span class="podcast-speed-label"
            >{{ playerStore.playbackRate }}x</span
          >
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

      <div class="podcast-secondary-actions">
        <button
          class="podcast-secondary-btn outline secondary"
          v-on:click="togglePlayed()"
        >
          <i
            class="bi"
            :class="
              item.status === 'read' ? 'bi-check2-circle-fill' : 'bi-check2-circle'
            "
          ></i>
          {{ item.status === "read" ? "Played" : "Mark as played" }}
        </button>
      </div>

      <div v-if="upNext.length > 0" class="podcast-up-next">
        <h4 class="podcast-up-next-title">
          Up next from {{ item.sourceName }}
        </h4>
        <ul class="podcast-up-next-list">
          <li v-for="row in upNext" :key="row.id">
            <button
              type="button"
              class="podcast-up-next-row"
              v-on:click="playUpNext(row)"
            >
              <span class="podcast-up-next-row-main">
                <span class="podcast-up-next-row-title">
                  <i
                    v-if="row.status === 'read'"
                    class="bi bi-check2-circle podcast-up-next-played"
                    title="Played"
                  ></i>
                  {{ row.title }}
                </span>
                <span class="podcast-up-next-row-meta">{{
                  relativeTime(row.datePublished)
                }}</span>
                <span
                  v-if="upNextProgress(row) > 0"
                  class="podcast-up-next-progress"
                >
                  <span
                    class="podcast-up-next-progress-fill"
                    :style="{ width: upNextProgress(row) + '%' }"
                  ></span>
                </span>
              </span>
              <i class="bi bi-play-circle podcast-up-next-play-icon"></i>
            </button>
          </li>
        </ul>
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
import { EventBus, EventTypes } from "~~/services/EventBus";
import { formatTime } from "~~/stores/PodcastPlayerStore";

const playerStore = PodcastPlayerStore();
const route = useRoute();
const router = useRouter();

const item = ref(null);
const loading = ref(true);
const upNext = ref([]);

const artwork = computed(() => {
  return item.value?.info?.artwork || item.value?.thumbnail || null;
});

const resumeHintVisible = computed(() => {
  const position = Number(item.value?.playbackPositionSeconds) || 0;
  return (
    position > 3 && !playerStore.isPlaying && playerStore.currentTime < 3
  );
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

async function togglePlayed() {
  if (!item.value) return;
  const status = item.value.status === "read" ? "unread" : "read";
  try {
    await axios.put(
      `${(await Config.get()).SERVER_URL}/items/status`,
      { status, itemIds: [item.value.id] },
      await AuthService.getAuthHeader(),
    );
    item.value.status = status;
    EventBus.emit(EventTypes.ITEMS_UPDATED, {});
  } catch (err) {
    console.error("Failed to update played state", err);
  }
}

function upNextProgress(row) {
  if (row.status === "read") return 0;
  const position = Number(row.playbackPositionSeconds) || 0;
  const duration = Number(row.playbackDurationSeconds) || 0;
  if (position <= 0 || duration <= 0) return 0;
  return Math.min(100, (position / duration) * 100);
}

async function playUpNext(row) {
  item.value = row;
  playerStore.play(row);
  router.replace({ query: { itemId: row.id } });
  await loadUpNext(row);
}

async function loadUpNext(currentItem) {
  if (!currentItem?.sourceId) {
    upNext.value = [];
    return;
  }
  try {
    const res = await axios.post(
      `${(await Config.get()).SERVER_URL}/items/search`,
      {
        searchCriteria: "sourceId",
        sourceId: currentItem.sourceId,
        filterStatus: "all",
        sort: "date_desc",
      },
      await AuthService.getAuthHeader(),
    );
    const rows = (res.data?.sourceItems || []).filter(
      (row) => row.id !== currentItem.id,
    );
    upNext.value = rows.slice(0, 5);
  } catch (err) {
    console.error("Failed to load up next episodes", err);
  }
}

function relativeTime(date) {
  const delta = Math.round((new Date() - new Date(date)) / 1000);
  const minute = 60,
    hour = minute * 60,
    day = hour * 24,
    week = day * 7,
    month = day * 30,
    year = day * 365;
  if (delta < 60) {
    return "just now";
  } else if (delta < hour) {
    return Math.floor(delta / minute) + " minutes ago";
  } else if (delta < 2 * hour) {
    return "1 hour ago";
  } else if (delta < day) {
    return Math.floor(delta / hour) + " hours ago";
  } else if (delta < 2 * day) {
    return "1 day ago";
  } else if (delta < week) {
    return Math.floor(delta / day) + " days ago";
  } else if (delta < 2 * week) {
    return "1 week ago";
  } else if (delta < month) {
    return Math.floor(delta / week) + " weeks ago";
  } else if (delta < 2 * month) {
    return "1 month ago";
  } else if (delta < year) {
    return Math.floor(delta / month) + " months ago";
  } else if (delta < 2 * year) {
    return "1 year ago";
  } else {
    return Math.floor(delta / year) + " years ago";
  }
}

onMounted(async () => {
  const itemId = route.query.itemId;
  if (!itemId) {
    if (playerStore.currentItem) {
      item.value = playerStore.currentItem;
    }
    loading.value = false;
    if (item.value) {
      loadUpNext(item.value);
    }
    return;
  }

  if (playerStore.currentItem?.id === itemId) {
    item.value = playerStore.currentItem;
    loading.value = false;
    loadUpNext(item.value);
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
    loadUpNext(item.value);
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

.podcast-resume-hint {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
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

.podcast-speed-btn {
  font-size: var(--font-sm);
  font-weight: 600;
}

.podcast-speed-label {
  white-space: nowrap;
}

.podcast-secondary-actions {
  display: flex;
  justify-content: center;
}

.podcast-secondary-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.podcast-up-next {
  width: 100%;
  margin-top: var(--space-md);
}

.podcast-up-next-title {
  margin: 0 0 var(--space-sm) 0;
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.podcast-up-next-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.podcast-up-next-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  text-align: left;
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  cursor: pointer;
}

.podcast-up-next-row:hover {
  background: var(--color-bg-hover);
}

.podcast-up-next-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.podcast-up-next-row-title {
  font-size: var(--font-sm);
  font-weight: 500;
  word-break: break-word;
  overflow-wrap: break-word;
}

.podcast-up-next-played {
  color: var(--color-primary);
}

.podcast-up-next-row-meta {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.podcast-up-next-progress {
  height: 3px;
  background-color: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}

.podcast-up-next-progress-fill {
  display: block;
  height: 100%;
  background-color: var(--color-primary);
}

.podcast-up-next-play-icon {
  font-size: 1.4em;
  color: var(--color-primary);
  flex-shrink: 0;
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
