<template>
  <div class="source-url-finder">
    <label>Site or feed URL</label>
    <div class="finder-url-row">
      <input
        v-model="siteUrl"
        type="text"
        placeholder="https://example.com"
        v-on:keyup.enter="findFeeds()"
      />
      <button
        v-if="!discovering"
        :disabled="!siteUrl.trim() || discovering"
        v-on:click="findFeeds()"
      >
        Find feeds
      </button>
      <Loading v-if="discovering" />
    </div>
    <div v-if="discoverError" class="finder-warning">
      <i class="bi bi-exclamation-triangle-fill"></i>
      {{ discoverError }}
    </div>
    <div v-if="feeds.length > 0" class="finder-candidates">
      <div
        v-for="feed in feeds"
        :key="feed.url"
        class="finder-candidate"
        :class="{ selected: selectedUrl === feed.url }"
        v-on:click="previewUrl(feed.url)"
      >
        <i class="bi bi-rss"></i>
        <span class="finder-candidate-title">{{
          feed.title || feed.url
        }}</span>
        <span v-if="feed.url !== siteUrl.trim()" class="finder-candidate-url">{{
          feed.url
        }}</span>
      </div>
    </div>
    <div
      v-if="!discovering && discoverDone && feeds.length === 0 && !discoverError"
      class="finder-no-results"
    >
      No feed found on this site
    </div>

    <div v-if="podcastSearchEnabled" class="finder-podcast-search">
      <label>Search podcasts</label>
      <input
        v-model="podcastTerm"
        type="search"
        placeholder="Search for a podcast…"
        v-on:input="onPodcastSearchInput()"
      />
      <Loading v-if="podcastSearching" />
      <div v-if="podcastError" class="finder-warning">
        <i class="bi bi-exclamation-triangle-fill"></i>
        {{ podcastError }}
      </div>
      <div v-if="podcastResults.length > 0" class="finder-candidates">
        <div
          v-for="result in podcastResults"
          :key="result.url"
          class="finder-candidate"
          :class="{ selected: selectedUrl === result.url }"
          v-on:click="previewUrl(result.url)"
        >
          <i class="bi bi-headphones"></i>
          <span class="finder-candidate-title">{{ result.title }}</span>
          <span v-if="result.author" class="finder-candidate-author">{{
            result.author
          }}</span>
        </div>
      </div>
    </div>

    <div v-if="previewing" class="finder-preview-loading">
      <Loading />
    </div>
    <div v-if="previewError" class="finder-warning">
      <i class="bi bi-exclamation-triangle-fill"></i>
      {{ previewError }}
    </div>
    <div v-if="preview" class="finder-preview">
      <div class="finder-preview-header">
        <i v-if="preview.processor?.icon" :class="'bi bi-' + preview.processor.icon"></i>
        <span class="finder-preview-processor">{{
          preview.processor?.title
        }}</span>
        <span class="finder-preview-name">{{ preview.name }}</span>
      </div>
      <ul class="finder-preview-items">
        <li v-for="(item, index) in preview.items" :key="index">
          <span class="finder-preview-item-title">{{ item.title }}</span>
          <span
            v-if="formatItemDate(item.datePublished)"
            class="finder-preview-item-date"
            >{{ formatItemDate(item.datePublished) }}</span
          >
        </li>
      </ul>
      <button
        v-if="!confirming"
        v-on:click="confirmSelection()"
        :disabled="!selectedUrl"
      >
        {{ confirmLabel }}
      </button>
      <Loading v-if="confirming" />
    </div>
  </div>
</template>

<script setup>
import axios from "axios";
import { debounce } from "lodash";
import { ref } from "vue";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const props = defineProps({
  confirmLabel: { type: String, required: true },
  podcastSearchEnabled: { type: Boolean, default: false },
});
const emit = defineEmits(["select"]);

const siteUrl = ref("");
const discovering = ref(false);
const discoverDone = ref(false);
const discoverError = ref("");
const feeds = ref([]);

const podcastTerm = ref("");
const podcastResults = ref([]);
const podcastSearching = ref(false);
const podcastSearchDone = ref(false);
const podcastError = ref("");

const selectedUrl = ref("");
const preview = ref(null);
const previewing = ref(false);
const previewError = ref("");
const confirming = ref(false);

async function findFeeds() {
  const url = siteUrl.value.trim();
  if (!url) {
    return;
  }
  discovering.value = true;
  discoverError.value = "";
  feeds.value = [];
  try {
    const res = await axios.get(
      `${(await Config.get()).SERVER_URL}/sources/discover`,
      {
        params: { url },
        ...(await AuthService.getAuthHeader()),
      },
    );
    feeds.value = res.data.feeds || [];
  } catch (err) {
    discoverError.value =
      err.response?.data?.error || err.message || "Feed discovery failed";
  }
  discovering.value = false;
  discoverDone.value = true;
}

async function previewUrl(url) {
  if (!url) {
    return;
  }
  selectedUrl.value = url;
  preview.value = null;
  previewError.value = "";
  previewing.value = true;
  try {
    const res = await axios.post(
      `${(await Config.get()).SERVER_URL}/sources/preview`,
      { url },
      await AuthService.getAuthHeader(),
    );
    preview.value = res.data;
  } catch (err) {
    previewError.value =
      err.response?.data?.error || err.message || "Preview failed";
  }
  previewing.value = false;
}

async function confirmSelection() {
  if (!selectedUrl.value) {
    return;
  }
  confirming.value = true;
  emit("select", selectedUrl.value, preview.value?.name || selectedUrl.value);
  confirming.value = false;
}

const debouncedPodcastSearch = debounce(async function (term) {
  if (!term || term.trim().length < 2) {
    podcastResults.value = [];
    podcastSearchDone.value = false;
    podcastError.value = "";
    return;
  }
  podcastSearching.value = true;
  podcastError.value = "";
  try {
    const res = await axios.get(
      `${(await Config.get()).SERVER_URL}/sources/search`,
      {
        params: { q: term.trim() },
        ...(await AuthService.getAuthHeader()),
      },
    );
    podcastResults.value = res.data.feeds || [];
  } catch (err) {
    podcastResults.value = [];
    podcastError.value =
      err.response?.data?.error || err.message || "Search failed";
  }
  podcastSearching.value = false;
  podcastSearchDone.value = true;
}, 400);

function onPodcastSearchInput() {
  debouncedPodcastSearch(podcastTerm.value);
}

function formatItemDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString();
}
</script>

<style scoped>
.source-url-finder {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.finder-url-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.finder-url-row input {
  flex: 1;
  margin: 0;
}

.finder-url-row button {
  margin: 0;
  white-space: nowrap;
}

.finder-warning {
  color: var(--color-warning);
  font-size: var(--font-base);
}

.finder-candidates {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 0.5rem);
}

.finder-candidate {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 0.5rem);
  padding: var(--space-xs, 0.5rem) var(--space-sm);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  cursor: pointer;
  min-width: 0;
}

.finder-candidate:hover {
  background: var(--color-bg-hover);
}

.finder-candidate.selected {
  border-color: var(--color-primary);
}

.finder-candidate-title {
  font-weight: 600;
  font-size: var(--font-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder-candidate-url,
.finder-candidate-author {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder-no-results {
  color: var(--color-text-muted);
  font-size: var(--font-base);
  padding: var(--space-xs, 0.5rem) 0;
}

.finder-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.finder-preview-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 0.5rem);
}

.finder-preview-processor {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.finder-preview-name {
  font-weight: 600;
}

.finder-preview-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs, 0.25rem);
}

.finder-preview-items li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  font-size: var(--font-sm);
}

.finder-preview-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finder-preview-item-date {
  color: var(--color-text-muted);
  white-space: nowrap;
}

.finder-preview button {
  align-self: flex-start;
  margin: 0;
}
</style>
