<template>
  <div v-if="attentionSources.length > 0" class="sources-attention">
    <h2>Sources needing attention</h2>
    <div class="sources-attention-list">
      <div
        v-for="source in attentionSources"
        v-bind:key="source.sourceId"
        class="sources-attention-item"
      >
        <NuxtLink
          class="sources-attention-link"
          :to="'/sources?sourceId=' + source.sourceId"
        >
          <span
            class="source-health"
            :class="'source-health-' + sourceHealth(source)"
            :title="sourceHealthTitle(source)"
          >
            <i :class="sourceHealthIcon(source)"></i>
          </span>
          <span class="sources-attention-name">{{ source.displayName }}</span>
        </NuxtLink>
        <button
          v-if="source.sourceInfo?.health === 'disabled'"
          class="secondary sources-attention-resume"
          :disabled="resumingSourceId === source.sourceId"
          title="Fetch this source now and resume automatic fetching"
          v-on:click="resumeFetching(source)"
        >
          <i class="bi bi-play-circle"></i> Resume fetching
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import {
  sourceHealth,
  sourceHealthIcon,
  sourceHealthTitle,
} from "~~/services/SourceHealthUI.ts";

const sourcesStore = SourcesStore();
const resumingSourceId = ref(null);

const attentionSources = computed(() => {
  const impacted = sourcesStore.sources.filter(
    (source) => !source.isLabel && sourceHealth(source),
  );
  const healthOrder = { disabled: 0, failing: 1, stale: 2 };
  return impacted.sort((a, b) => {
    const healthDiff =
      healthOrder[a.sourceInfo?.health] - healthOrder[b.sourceInfo?.health];
    if (healthDiff !== 0) {
      return healthDiff;
    }
    return (a.displayName || "").localeCompare(b.displayName || "");
  });
});

async function resumeFetching(source) {
  resumingSourceId.value = source.sourceId;
  await axios
    .put(
      `${(await Config.get()).SERVER_URL}/sources/${source.sourceId}/fetch`,
      {},
      await AuthService.getAuthHeader(),
    )
    .then(() => {
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        type: "info",
        text: `Fetching ${source.displayName} — a successful fetch resumes automatic fetching`,
      });
      UserProcessorInfoStore().check();
      // The fetch runs asynchronously server-side: refresh once it had a
      // chance to complete so a success clears the entry.
      setTimeout(() => sourcesStore.fetch(), 5000);
    })
    .catch(handleError)
    .finally(() => {
      resumingSourceId.value = null;
    });
}
</script>

<style scoped>
.sources-attention {
  margin-bottom: var(--space-2xl);
  padding: var(--space-base);
  border: 1px solid var(--pico-muted-border-color, var(--color-border));
  border-radius: var(--radius-lg);
}

.sources-attention-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-sm);
}

.sources-attention-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.sources-attention-link {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 0.5rem);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.sources-attention-link:hover {
  text-decoration: underline;
}

.sources-attention-resume {
  flex-shrink: 0;
  width: auto;
  height: 2.6rem;
  margin: 0;
  padding: 0 var(--space-base);
  font-size: var(--font-sm);
}

.source-health {
  opacity: 0.7;
}

.source-health-disabled {
  color: var(--color-text-muted);
}

.source-health-failing {
  color: var(--color-danger);
}

.source-health-stale {
  color: var(--color-warning);
}
</style>
