<template>
  <div class="source-list-container">
    <div class="source-list-filter">
      <input
        v-model="filterText"
        class="source-filter-input"
        type="search"
        placeholder="Filter sources..."
      />
    </div>
    <div class="source-list-scroll">
      <div
        v-for="(source, index) in filteredSources"
        v-bind:key="(source.sourceId || source.labelName) + '-' + index"
      >
        <div
          v-if="source.isVisible || filterText"
          class="source-name-layout"
          :class="{ 'source-active': sourcesStore.selectedIndex == index }"
          :ref="'source-' + index"
        >
          <span
            v-on:click="toggleLabelCollapsed(source, index)"
            class="source-name-indent"
            :style="indentStyle(source)"
          >
            <i
              v-if="source.isLabel && source.isCollapsed"
              class="bi bi-caret-right-fill"
            ></i>
            <i v-else-if="source.isLabel" class="bi bi-caret-down-fill"></i>
          </span>
          <div
            v-on:click="onSourceSelected(source, index)"
            class="source-name-name"
          >
            <span v-if="!source.isLabel"
              ><i :class="'bi bi-' + source.icon"></i>&nbsp;</span
            >
            <span
              v-else-if="!source.isRoot"
              ><i
                :class="
                  source.isCollapsed ? 'bi bi-folder-fill' : 'bi bi-folder2-open'
                "
              >&nbsp;</i></span
            >
            {{ source.displayName }}
            <span
              v-if="sourceHealth(source)"
              class="source-health"
              :class="'source-health-' + sourceHealth(source)"
              :title="sourceHealthTitle(source)"
            >
              <i :class="sourceHealthIcon(source)"></i>
            </span>
          </div>
          <div
            v-if="displayCount"
            v-on:click="onSourceSelected(source, index)"
            class="source-name-count"
            :class="{ 'source-name-count-zero': source[displayCount] === 0 }"
          >
            {{ source[displayCount] }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const sourcesStore = SourcesStore();
const filterText = ref("");

const filteredSources = computed(() => {
  const text = filterText.value.trim().toLowerCase();
  if (!text) {
    return sourcesStore.sources;
  }
  const result = [];
  const addedLabels = new Set();
  for (const source of sourcesStore.sources) {
    if (!source.isLabel) {
      const nameMatch = source.displayName?.toLowerCase().includes(text);
      const labelMatch = source.labelName?.toLowerCase().includes(text);
      if (nameMatch || labelMatch) {
        // Add all ancestor label entries once
        if (source.labelName) {
          const parts = source.labelName.split("/");
          let accumulated = "";
          for (const part of parts) {
            accumulated = accumulated ? accumulated + "/" + part : part;
            if (!addedLabels.has(accumulated)) {
              const labelEntry = sourcesStore.sources.find(
                (s) => s.isLabel && s.labelName === accumulated,
              );
              if (labelEntry) {
                result.push({ ...labelEntry, isVisible: true });
                addedLabels.add(accumulated);
              }
            }
          }
        }
        result.push({ ...source, isVisible: true });
      }
    }
  }
  return result;
});
</script>

<script>
import * as _ from "lodash";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import {
  sourceHealth,
  sourceHealthIcon,
  sourceHealthTitle,
} from "~~/services/SourceHealthUI.ts";

export default {
  props: {
    displayCount: false,
  },
  data() {
    return {
      knownSelectedIndex: -1,
    };
  },
  async created() {
    if (!SourceItemsStore().selectedSource) {
      SourcesStore().selectedIndex = 0;
    }
    SourcesStore().fetch();
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      SourcesStore().fetchCounts();
      setTimeout(() => {
        SourcesStore().fetchCounts();
      }, 2000);
    });
    EventBus.on(EventTypes.SOURCES_UPDATED, (message) => {
      SourcesStore().fetch();
    });
    watch(
      () => SourcesStore().selectedIndex,
      () => {
        this.scrollToSelectedIndex();
      },
    );
    this.scrollToSelectedIndex();
  },
  methods: {
    sourceHealth,
    sourceHealthIcon,
    sourceHealthTitle,
    onSourceSelected(source, index) {
      this.knownSelectedIndex = index;
      SourcesStore().selectedIndex = index;
      if (source.isRoot) {
        this.$emit("onRootSelected", {});
      } else if (source.isLabel) {
        this.$emit("onLabelSelected", source);
      } else {
        this.$emit("onSourceSelected", source);
      }
    },
    isLabelDisplayed(index) {
      if (!SourcesStore().sourceLabels[index].labelName) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      if (
        SourcesStore().sourceLabels[index].labelName ===
        SourcesStore().sourceLabels[index - 1].labelName
      ) {
        return false;
      }
      return true;
    },
    indentStyle(source) {
      return {
        width: `calc(${source.depth} * 1rem + 0.25rem)`,
      };
    },
    toggleLabelCollapsed(label, index) {
      SourcesStore().toggleLabelCollapsed(index);
    },
    scrollToSelectedIndex() {
      if (this.knownSelectedIndex === SourcesStore().selectedIndex) {
        return;
      }
      setTimeout(() => {
        const element = this.$refs["source-" + SourcesStore().selectedIndex];
        if (element && element[0]) {
          element[0].scrollIntoView({
            behavior: "smooth",
          });
        }
      }, 500);
    },
  },
};
</script>

<style scoped>
.source-list-container {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
}

.source-list-filter {
  grid-row: 1;
  padding: var(--space-xs) var(--space-sm);
}

.source-list-scroll {
  grid-row: 2;
  overflow-y: auto;
  min-height: 0;
}

.source-filter-input {
  width: 100%;
  align-self: stretch;
  font-size: var(--font-sm);
  padding-top: 0;
  padding-bottom: 0;
  height: 2.4rem;
  margin-bottom: 0;
  border-radius: var(--radius-md);
}

.source-health {
  font-size: 0.75em;
  margin-left: var(--space-2xs, 0.25rem);
  opacity: 0.7;
}

.source-health-failing {
  color: var(--color-danger);
}

.source-health-stale {
  color: var(--color-warning);
}

/* Touch-friendly rows */
.source-name-layout {
  align-items: center;
  min-height: 2.6rem;
}

.source-name-indent {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  min-width: 1.2rem;
}

.source-name-indent i {
  padding: 0.35rem 0.3rem;
}

/* Unread counts as badges; zero counts dimmed */
.source-name-count {
  font-weight: 600;
  font-size: var(--font-xs);
  background-color: var(--color-primary-light);
  color: var(--color-primary-text);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.5rem;
  min-width: 1.4rem;
  text-align: center;
}

.source-name-count-zero {
  background: none;
  color: var(--color-text-muted);
  font-weight: 400;
  opacity: 0.55;
}

:root[data-theme="dark"] .source-name-count-zero {
  opacity: 0.4;
}
</style>
