<template>
  <div>
    <div v-on:click="loadAllItems()" class="source-name-layout" :class="{ 'source-active': selectedIndex == -3 }">
      <div class="source-name-indent">
        <i class="bi bi-caret-down-fill"></i>
      </div>
      <div class="source-name-name">All Items</div>
      <div class="source-name-count">{{ getCountAll() }}</div>
    </div>
    <div v-for="(sourceLabel, index) in sourceLabels" v-bind:key="sourceLabel.labelName">
      <div
        v-if="isLabelDisplayed(index)"
        :class="{ 'source-active': index == selectedIndex && !activeSourceItems.selectedSource }"
        class="source-name-layout"
      >
        <div v-on:click="toggleLabelCollapsed(sourceLabel.labelName)" class="source-name-indent">
          <span v-html="getLabelIndentation(index)"></span>
          <i v-if="isLabelCollapsed(sourceLabel.labelName)" class="bi bi-caret-right-fill"></i>
          <i v-else class="bi bi-caret-down-fill"></i>
        </div>
        <div class="source-name-name" v-on:click="loadLabelItems(index)">
          {{ sourceLabel.labelName }}
        </div>
        <div class="source-name-count">{{ getCountLabel(index) }}</div>
      </div>
      <div
        v-on:click="loadSourceItems(index)"
        class="source-name-layout"
        :class="{ 'source-active': index == selectedIndex && activeSourceItems.selectedSource }"
        v-if="!isLabelCollapsed(sourceLabel.labelName)"
      >
        <div class="source-name-indent">
          <span v-html="getSourceIndentation(index)"></span>
          <i v-if="sourceLabel.sourceInfo.icon" :class="'bi bi-' + sourceLabel.sourceInfo.icon"></i>
        </div>
        <div class="source-name-name">
          {{ sourceLabel.sourceName }}
        </div>
        <div class="source-name-count">{{ getCountSource(sourceLabel.sourceId) }}</div>
      </div>
    </div>
    <div v-on:click="loadSavedItems()" :class="{ 'source-active': selectedIndex == -2 }">
      <i class="bi bi-bookmark-plus-fill"></i>
      Saved Items
    </div>
  </div>
</template>

<script setup>
const activeSourceItems = ActiveSourceItems();
</script>

<script>
import axios from "axios";
import * as _ from "lodash";
import Config from "../services/Config.ts";
import { handleError, EventBus, EventTypes } from "../services/EventBus";
import { AuthService } from "../services/AuthService";
import { PreferencesLabels } from "../services/PreferencesLabels";

export default {
  data() {
    return {
      sources: [],
      sourceItems: [],
      selectedIndex: -1,
      sourceLabels: [],
      sourceCounts: [],
      menuOpened: true,
    };
  },
  async created() {
    this.loadSources();
    this.loadAllItems();
    this.loadSourcesCounts();
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      this.loadSourcesCounts();
    });
    EventBus.on(EventTypes.SOURCES_UPDATED, (message) => {
      this.loadSources();
      this.loadSourcesCounts();
    });
  },
  methods: {
    async loadSources() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceLabels = _.sortBy(res.data.sourceLabels, ["labelName", "sourceName"]);
        })
        .catch(handleError);
    },
    async loadSourcesCounts() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels/counts/unread`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceCounts = res.data.counts;
        })
        .catch(handleError);
    },
    async loadSourceItems(index) {
      this.selectedIndex = index;
      const activeSourceItems = ActiveSourceItems();
      activeSourceItems.selectedSource = this.sourceLabels[index].sourceId;
      activeSourceItems.page = 1;
      activeSourceItems.searchCriteria = "sourceId";
      activeSourceItems.searchCriteriaValue = this.sourceLabels[index].sourceId;
      activeSourceItems.filterStatus = "unread";
      activeSourceItems.fetchItems();
    },
    async loadLabelItems(index) {
      this.selectedIndex = index;
      const activeSourceItems = ActiveSourceItems();
      activeSourceItems.selectedSource = null;
      activeSourceItems.page = 1;
      activeSourceItems.searchCriteria = "labelName";
      activeSourceItems.searchCriteriaValue = this.sourceLabels[index].labelName;
      activeSourceItems.filterStatus = "unread";
      activeSourceItems.fetchItems();
    },
    async loadAllItems() {
      this.selectedIndex = -3;
      const activeSourceItems = ActiveSourceItems();
      activeSourceItems.selectedSource = null;
      activeSourceItems.page = 1;
      activeSourceItems.searchCriteria = "all";
      activeSourceItems.filterStatus = "unread";
      activeSourceItems.fetchItems();
    },
    async loadSavedItems(index) {
      this.selectedIndex = -2;
      const activeSourceItems = ActiveSourceItems();
      activeSourceItems.selectedSource = null;
      activeSourceItems.page = 1;
      activeSourceItems.searchCriteria = "lists";
      activeSourceItems.filterStatus = "all";
      activeSourceItems.fetchItems();
    },
    async refreshSourceItems(sourceId) {
      this.selectedSource = sourceId;
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
    },
    async refreshAndFetch() {
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
      this.loadSources();
      this.loadSourcesCounts();
    },
    async refresh() {
      this.loadSources();
      this.loadSourcesCounts();
    },
    async markAllRead() {
      let confirmed = false;
      if (this.sourceItems.length > 1) {
        confirmed = confirm("Mark all item read?");
      } else {
        confirmed = true;
      }
      if (confirmed === true) {
        for (const item of this.sourceItems) {
          await axios
            .put(
              `${(await Config.get()).SERVER_URL}/sources/items/${item.id}/status`,
              { status: "read" },
              await AuthService.getAuthHeader()
            )
            .then((res) => {
              item.status = "read";
            })
            .catch(handleError);
        }
        this.onItemsUpdated();
      }
    },
    isLabelDisplayed(index) {
      if (!this.sourceLabels[index].labelName) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      if (this.sourceLabels[index].labelName === this.sourceLabels[index - 1].labelName) {
        return false;
      }
      return true;
    },
    getLabelIndentation(index) {
      return "&nbsp;&nbsp;&nbsp;&nbsp;";
    },
    getSourceIndentation(index) {
      if (!this.sourceLabels[index].labelName) {
        return "&nbsp;&nbsp;&nbsp;&nbsp;";
      }
      let indentation = "&nbsp;&nbsp;&nbsp;&nbsp;";
      for (const count in this.sourceLabels[index].labelName.split("/")) {
        indentation += "&nbsp;&nbsp;&nbsp;&nbsp;";
      }
      return indentation;
    },
    getCountLabel(index) {
      let count = 0;
      let indexIteration = index;
      const label = this.sourceLabels[indexIteration].labelName;
      while (this.sourceLabels.length > indexIteration && this.sourceLabels[indexIteration].labelName === label) {
        count += this.getCountSource(this.sourceLabels[indexIteration].sourceId);
        indexIteration++;
      }
      return count;
    },
    getCountSource(sourceId) {
      const count = _.find(this.sourceCounts, { sourceId });
      if (!count) {
        return 0;
      }
      return count.unreadCount;
    },
    getCountAll() {
      let count = 0;
      for (let i = 0; i < this.sourceCounts.length; i++) {
        count += this.sourceCounts[i].unreadCount;
      }
      return count;
    },
    onItemsUpdated(item) {
      this.loadSourcesCounts();
    },
    isLabelCollapsed(label) {
      return PreferencesLabels.isCollapsed(label);
    },
    toggleLabelCollapsed(label) {
      PreferencesLabels.toggleCollapsed(label);
      this.$forceUpdate();
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
