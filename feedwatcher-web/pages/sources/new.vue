<template>
  <div class="new-source-page">
    <h4>New Source</h4>

    <div class="mode-toggle">
      <button
        :class="['mode-btn', { active: mode === 'url' }]"
        v-on:click="mode = 'url'"
      >
        <i class="bi bi-link-45deg"></i> Add by URL
      </button>
      <button
        v-if="podcastSearchEnabled"
        :class="['mode-btn', { active: mode === 'search' }]"
        v-on:click="mode = 'search'"
      >
        <i class="bi bi-search"></i> Search Podcasts
      </button>
    </div>

    <!-- Mode A: Add by URL -->
    <div v-if="mode === 'url'" class="mode-section">
      <label>Feed URL</label>
      <input
        v-model="sourceUrl"
        type="text"
        placeholder="https://example.com/feed.xml"
      />
      <div v-if="alreadyExists" class="source-exists-warning">
        <i class="bi bi-exclamation-triangle-fill"></i>
        This source already exists
      </div>
      <button
        v-if="!adding"
        v-on:click="addByUrl()"
        :disabled="!sourceUrl.trim()"
      >
        Add
      </button>
      <Loading v-if="adding" />
    </div>

    <!-- Mode B: Search Podcasts -->
    <div v-if="mode === 'search'" class="mode-section">
      <label>Search term</label>
      <input
        v-model="searchTerm"
        type="search"
        placeholder="Search for a podcast…"
        v-on:input="onSearchInput()"
      />
      <Loading v-if="searching" />
      <div v-if="searchError" class="source-exists-warning">
        <i class="bi bi-exclamation-triangle-fill"></i>
        {{ searchError }}
      </div>
      <div v-if="!searching && searchResults.length > 0" class="search-results">
        <div
          v-for="result in searchResults"
          :key="result.url"
          class="search-result-item"
        >
          <img
            v-if="result.image"
            :src="result.image"
            :alt="result.title"
            class="search-result-image"
          />
          <div v-else class="search-result-image-placeholder">
            <i class="bi bi-headphones"></i>
          </div>
          <div class="search-result-info">
            <div class="search-result-title">{{ result.title }}</div>
            <div v-if="result.author" class="search-result-author">
              {{ result.author }}
            </div>
            <div v-if="result.description" class="search-result-description">
              {{ truncate(result.description, 120) }}
            </div>
          </div>
          <div class="search-result-action">
            <button
              v-if="isAlreadyAdded(result.url)"
              class="outline secondary"
              disabled
            >
              Added
            </button>
            <button
              v-else
              v-on:click="addFromSearch(result)"
              :disabled="addingUrl === result.url"
            >
              <Loading v-if="addingUrl === result.url" />
              <span v-else>Add</span>
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="
          !searching && searchDone && searchResults.length === 0 && !searchError
        "
        class="search-no-results"
      >
        No podcasts found for "{{ lastSearchTerm }}"
      </div>
    </div>
  </div>
</template>

<script setup>
import axios from "axios";
import { debounce } from "lodash";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

const router = useRouter();
const sourcesStore = SourcesStore();

const mode = ref("url");
const podcastSearchEnabled = ref(false);

// --- Mode A: Add by URL ---
const sourceUrl = ref("");
const adding = ref(false);

const alreadyExists = computed(() => {
  const url = sourceUrl.value.trim();
  if (!url) return false;
  return sourcesStore.sources.some(
    (s) => !s.isLabel && s.sourceInfo?.url === url,
  );
});

async function addByUrl() {
  const url = sourceUrl.value.trim();
  if (!url) {
    EventBus.emit(EventTypes.ALERT_MESSAGE, {
      type: "error",
      text: "URL missing",
    });
    return;
  }
  adding.value = true;
  try {
    const res = await axios.post(
      `${(await Config.get()).SERVER_URL}/sources`,
      { url },
      await AuthService.getAuthHeader(),
    );
    EventBus.emit(EventTypes.ALERT_MESSAGE, {
      type: "info",
      text: "Source added",
    });
    await sourcesStore.fetch();
    router.push(`/sources/${res.data.id}`);
  } catch (err) {
    handleError(err);
  }
  adding.value = false;
}

// --- Mode B: Search Podcasts ---
const searchTerm = ref("");
const searchResults = ref([]);
const searching = ref(false);
const searchDone = ref(false);
const searchError = ref("");
const lastSearchTerm = ref("");
const addingUrl = ref("");

const debouncedSearch = debounce(async function (term) {
  if (!term || term.trim().length < 2) {
    searchResults.value = [];
    searchDone.value = false;
    searchError.value = "";
    return;
  }
  searching.value = true;
  searchError.value = "";
  lastSearchTerm.value = term.trim();
  try {
    const res = await axios.get(
      `${(await Config.get()).SERVER_URL}/sources/search`,
      {
        params: { q: term.trim() },
        ...(await AuthService.getAuthHeader()),
      },
    );
    searchResults.value = res.data.feeds || [];
  } catch (err) {
    searchResults.value = [];
    searchError.value =
      err.response?.data?.error || err.message || "Search failed";
  }
  searching.value = false;
  searchDone.value = true;
}, 400);

function onSearchInput() {
  debouncedSearch(searchTerm.value);
}

function isAlreadyAdded(url) {
  if (!url) return false;
  return sourcesStore.sources.some(
    (s) => !s.isLabel && s.sourceInfo?.url === url,
  );
}

async function addFromSearch(result) {
  addingUrl.value = result.url;
  try {
    const res = await axios.post(
      `${(await Config.get()).SERVER_URL}/sources`,
      { url: result.url },
      await AuthService.getAuthHeader(),
    );
    EventBus.emit(EventTypes.ALERT_MESSAGE, {
      type: "info",
      text: `Added: ${result.title}`,
    });
    await sourcesStore.fetch();
    router.push(`/sources/${res.data.id}`);
  } catch (err) {
    handleError(err);
  }
  addingUrl.value = "";
}

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

onMounted(async () => {
  if (!(await AuthenticationStore().ensureAuthenticated())) {
    router.push({ path: "/users" });
    return;
  }
  sourcesStore.fetch();
  try {
    const res = await axios.get(`${(await Config.get()).SERVER_URL}/status`);
    podcastSearchEnabled.value = !!res.data.podcastSearchEnabled;
  } catch {
    podcastSearchEnabled.value = false;
  }
});
</script>

<style scoped>
.new-source-page {
  padding: var(--space-sm);
  max-width: 40em;
}

.mode-toggle {
  display: flex;
  gap: 0;
  margin-bottom: var(--space-xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--font-base);
  font-weight: 500;
  margin: 0;
  border-radius: 0;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.mode-btn.active {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.mode-btn:not(.active):hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.mode-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.source-exists-warning {
  color: var(--color-warning);
  font-size: var(--font-base);
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.search-result-item {
  display: grid;
  grid-template-columns: 4rem 1fr auto;
  gap: var(--space-md);
  align-items: start;
  padding: var(--space-sm);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.search-result-image {
  width: 4rem;
  height: 4rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.search-result-image-placeholder {
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 1.5em;
  color: var(--color-text-muted);
}

.search-result-info {
  min-width: 0;
}

.search-result-title {
  font-weight: 600;
  font-size: var(--font-base);
  line-height: 1.3;
}

.search-result-author {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-top: 2px;
}

.search-result-description {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-result-action {
  display: flex;
  align-items: center;
}

.search-result-action button {
  white-space: nowrap;
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-sm);
}

.search-no-results {
  color: var(--color-text-muted);
  font-size: var(--font-base);
  padding: var(--space-lg) 0;
}
</style>
