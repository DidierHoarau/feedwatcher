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
        <div v-on:click="loadItemsv2(source, index)" class="source-name-name">{{ source.displayName }}</div>
        <div v-on:click="loadItemsv2(source, index)" class="source-name-count">{{ source.unreadCount }}</div>
      </div>
    </div>
    <div v-on:click="loadSavedItems()" :class="{ 'source-active': sourcesStore.selectedIndex == -2 }">
      <i class="bi bi-bookmark-plus-fill"></i>
      Saved Items
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
import { PreferencesLabels } from "~~/services/PreferencesLabels";

export default {
  async created() {
    this.loadAllItems();
    SourcesStore().fetch();
    SourcesStore().fetchCounts();
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      SourcesStore().fetchCounts();
    });
    EventBus.on(EventTypes.SOURCES_UPDATED, (message) => {
      SourcesStore().fetch();
      SourcesStore().fetchCounts();
    });
  },
  methods: {
    loadItemsv2(source, index) {
      SourcesStore().selectedIndex = index;
      if (source.isRoot) {
        this.loadAllItems();
      } else if (source.isLabel) {
        this.loadLabelItems(source);
      } else {
        this.loadSourceItems(source);
      }
    },
    async loadSourceItems(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = source.sourceId;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "sourceId";
      sourceItemsStore.searchCriteriaValue = source.sourceId;
      sourceItemsStore.filterStatus = "unread";
      sourceItemsStore.fetch();
    },
    async loadLabelItems(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "labelName";
      sourceItemsStore.searchCriteriaValue = source.labelName;
      sourceItemsStore.filterStatus = "unread";
      sourceItemsStore.fetch();
    },
    async loadAllItems() {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "all";
      sourceItemsStore.filterStatus = "unread";
      sourceItemsStore.fetch();
    },
    async loadSavedItems(index) {
      SourcesStore().selectedIndex = -2;
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "lists";
      sourceItemsStore.filterStatus = "all";
      sourceItemsStore.fetch();
    },
    async refreshAndFetch() {
      SourcesStore().fetch();
      SourcesStore().fetchCounts();
    },
    async refresh() {
      SourcesStore().fetch();
      SourcesStore().fetchCounts();
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
