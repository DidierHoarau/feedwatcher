<template>
  <div v-if="attentionSources.length > 0" class="sources-attention">
    <h2>Sources needing attention</h2>
    <div class="sources-attention-list">
      <NuxtLink
        v-for="source in attentionSources"
        v-bind:key="source.sourceId"
        class="sources-attention-item"
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
    </div>
  </div>
</template>

<script setup>
import {
  sourceHealth,
  sourceHealthIcon,
  sourceHealthTitle,
} from "~~/services/SourceHealthUI.ts";

const sourcesStore = SourcesStore();

const attentionSources = computed(() => {
  const impacted = sourcesStore.sources.filter(
    (source) => !source.isLabel && sourceHealth(source),
  );
  const healthOrder = { failing: 0, stale: 1 };
  return impacted.sort((a, b) => {
    const healthDiff =
      healthOrder[a.sourceInfo?.health] - healthOrder[b.sourceInfo?.health];
    if (healthDiff !== 0) {
      return healthDiff;
    }
    return (a.displayName || "").localeCompare(b.displayName || "");
  });
});
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
  align-items: flex-start;
  gap: var(--space-sm);
}

.sources-attention-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 0.5rem);
  color: inherit;
  text-decoration: none;
}

.sources-attention-item:hover {
  text-decoration: underline;
}

.source-health {
  opacity: 0.7;
}

.source-health-failing {
  color: var(--color-danger);
}

.source-health-stale {
  color: var(--color-warning);
}
</style>
