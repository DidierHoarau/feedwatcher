<template>
  <div class="source-list-container">
    <div class="source-list-filter">
      <input
        v-model="filterText"
        class="source-filter-input"
        type="text"
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
          >
            <span v-html="getIndentation(source)"></span>
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
            {{ source.displayName }}
          </div>
          <div
            v-if="displayCount"
            v-on:click="onSourceSelected(source, index)"
            class="source-name-count"
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

export default {
  props: {
    displayCount: false,
    displaySaved: false,
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
    getIndentation(source) {
      let indent = "";
      for (let i = 0; i < source.depth; i++) {
        indent += "&nbsp;&nbsp;&nbsp;&nbsp;";
      }
      return indent;
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
:root[data-theme="dark"] .source-active {
  background-color: #333;
}

:root[data-theme="light"] .source-active {
  background-color: #bbb;
}

.source-name-layout {
  display: grid;
  grid-template-columns: auto 1fr auto;
  padding: 0.3em 0.5em;
}
.source-name-indent {
  grid-column: 1;
  padding-right: 0.5em;
}
.source-name-name {
  grid-column: 2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.source-name-count {
  grid-column: 3;
}

.source-list-container {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
}

.source-list-filter {
  grid-row: 1;
  padding: 0.4em 0.5em;
}

.source-list-scroll {
  grid-row: 2;
  overflow-y: auto;
  min-height: 0;
}

.source-filter-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 0.8em;
  padding: 0 0.8rem;
  height: 2.4rem;
}
</style>
