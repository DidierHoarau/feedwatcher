<template>
  <div>
    <div v-for="(source, index) in sourcesStore.sources" v-bind:key="source.name">
      <div
        v-if="source.isVisible"
        class="source-name-layout"
        :class="{ 'source-active': sourcesStore.selectedIndex == index }"
      >
        <span v-on:click="toggleLabelCollapsed(source, index)" class="source-name-indent">
          <span v-html="getIndentation(source)"></span>
          <i v-if="source.isLabel && source.isCollapsed" class="bi bi-caret-right-fill"></i>
          <i v-else-if="source.isLabel" class="bi bi-caret-down-fill"></i>
        </span>
        <div v-on:click="onSourceSelected(source, index)" class="source-name-name">
          <span v-if="!source.isLabel"><i :class="'bi bi-' + source.icon"></i>&nbsp;</span>
          {{ source.displayName }}
        </div>
        <div v-if="displayCount" v-on:click="onSourceSelected(source, index)" class="source-name-count">
          {{ source[displayCount] }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const sourcesStore = SourcesStore();
</script>

<script>
import * as _ from "lodash";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  props: {
    displayCount: false,
    displaySaved: false,
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
  },
  methods: {
    onSourceSelected(source, index) {
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
      if (SourcesStore().sourceLabels[index].labelName === SourcesStore().sourceLabels[index - 1].labelName) {
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
  },
};
</script>

<style scoped>
@media (prefers-color-scheme: dark) {
  .source-active {
    background-color: #333;
  }
}
@media (prefers-color-scheme: light) {
  .source-active {
    background-color: #bbb;
  }
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
</style>
