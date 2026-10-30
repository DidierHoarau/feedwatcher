<template>
  <div
    class="source-tree-row"
    :class="{
      'source-tree-row-root': row.isRoot,
      'source-tree-row-active': active,
    }"
    :style="{ '--tree-depth': row.depth }"
    :data-tree-depth="row.depth"
    :data-tree-kind="row.isRoot ? 'root' : row.isLabel ? 'label' : 'source'"
  >
    <span
      v-if="showCaret"
      class="source-tree-caret"
      :title="row.isCollapsed ? 'Expand' : 'Collapse'"
      v-on:click.stop="$emit('toggle')"
    >
      <i
        :class="
          row.isCollapsed ? 'bi bi-caret-right-fill' : 'bi bi-caret-down-fill'
        "
      ></i>
    </span>
    <span class="source-tree-icon"><i :class="iconClass"></i></span>
    <div class="source-tree-name" v-on:click="$emit('select')">
      {{ row.displayName }}
      <span
        v-if="health"
        class="source-tree-health"
        :class="'source-tree-health-' + health"
        :title="healthTitle"
      >
        <i :class="healthIcon"></i>
      </span>
    </div>
    <div
      v-if="displayCount"
      v-on:click="$emit('select')"
      class="source-tree-count"
      :class="{ 'source-tree-count-zero': row[displayCount] === 0 }"
    >
      {{ row[displayCount] }}
    </div>
  </div>
</template>

<script setup>
import {
  sourceHealth,
  sourceHealthIcon,
  sourceHealthTitle,
} from "~~/services/SourceHealthUI.ts";

const props = defineProps({
  row: { type: Object, required: true },
  displayCount: { type: [String, Boolean], default: false },
  active: { type: Boolean, default: false },
  // The label picker has no toggle handler, so it hides the carets.
  collapsible: { type: Boolean, default: true },
});

defineEmits(["select", "toggle"]);

const iconClass = computed(() => {
  if (props.row.isRoot) {
    return "bi bi-collection";
  }
  if (props.row.isLabel) {
    return props.row.isCollapsed ? "bi bi-folder-fill" : "bi bi-folder2-open";
  }
  return `bi bi-${props.row.icon}`;
});

// A caret is decoration in the gutter of the row's own level: it never
// contributes to the layout, so labels and sources at the same depth keep the
// same icon and name column with or without one.
const showCaret = computed(
  () =>
    Boolean(props.row.hasChildren) && props.collapsible && !props.row.isRoot,
);

const health = computed(() => sourceHealth(props.row));
const healthIcon = computed(() => sourceHealthIcon(props.row));
const healthTitle = computed(() => sourceHealthTitle(props.row));
</script>

<style scoped>
.source-tree-health {
  font-size: 0.75em;
  margin-left: 0.25rem;
  opacity: 0.7;
}

.source-tree-health-disabled {
  color: var(--color-text-muted);
}

.source-tree-health-failing {
  color: var(--color-danger);
}

.source-tree-health-stale {
  color: var(--color-warning);
}

.source-tree-count {
  font-weight: 600;
  font-size: var(--font-xs);
  background-color: var(--color-primary-light);
  color: var(--color-primary-text);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.5rem;
  min-width: 1.4rem;
  text-align: center;
}

.source-tree-count-zero {
  background: none;
  color: var(--color-text-muted);
  font-weight: 400;
  opacity: 0.55;
}

:root[data-theme="dark"] .source-tree-count-zero {
  opacity: 0.4;
}
</style>
