<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h1>Sources</h1>
    </div>
    <div id="sources-actions" class="actions">
      <i class="bi bi-caret-up-square sources-actions-menu-toggle" v-if="menuOpened" v-on:click="openListMenu()"></i>
      <i class="bi bi-caret-down-square sources-actions-menu-toggle" v-else v-on:click="openListMenu()"></i>
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
    </div>
    <div id="sources-list" :class="{ 'sources-list-closed': !menuOpened }">
      <div v-on:click="loadAllItems()" class="source-name-layout" :class="{ 'source-active': selectedIndex == -3 }">
        <div class="source-name-name">
          <i class="bi bi-caret-down-fill"></i>
          All Items
        </div>
        <div class="source-name-count">{{ getCountAll() }}</div>
      </div>
      <div v-for="(sourceLabel, index) in sourceLabels" v-bind:key="sourceLabel.labelName">
        <div
          v-on:click="loadLabelItems(index)"
          v-if="isLabelDisplayed(index)"
          class="source-name-layout"
          :class="{ 'source-active': index == selectedIndex && !selectedSource }"
        >
          <div class="source-name-name">
            <span v-html="getLabelIndentation(index)"></span>
            <i class="bi bi-caret-down-fill"></i>
            {{ sourceLabel.labelName }}
          </div>
          <div class="source-name-count">{{ getCountLabel(index) }}</div>
        </div>
        <div
          v-on:click="loadSourceItems(index)"
          class="source-name-layout"
          :class="{ 'source-active': index == selectedIndex && selectedSource }"
        >
          <div class="source-name-name">
            <span v-html="getSourceIndentation(index)"></span>
            <i v-if="sourceLabel.sourceInfo.icon" :class="'bi bi-' + sourceLabel.sourceInfo.icon"></i>
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
    <div id="sources-items-actions" class="actions">
      <NuxtLink v-if="selectedSource" :to="'/sources/' + selectedSource"><i class="bi bi-pencil-square"></i></NuxtLink>
      <i v-if="selectedSource" v-on:click="refreshSourceItems(selectedSource)" class="bi bi-arrow-clockwise"></i>
      <i v-if="sourceItems.length > 0" v-on:click="markAllRead()" class="bi bi-archive"></i>
    </div>
    <div id="sources-items-list">
      <span v-if="sourceItems.length == 0">No items</span>
      <div v-for="sourceItem in sourceItems" v-bind:key="sourceItem.id">
        <SourceItem @onItemUpdated="onItemsUpdated" :item="sourceItem" />
      </div>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import * as _ from "lodash";
import Config from "../../services/Config.ts";
import { Timeout } from "../../services/Timeout.ts";
import { AuthService } from "../../services/AuthService";
import { handleError, EventBus, EventTypes } from "../../services/EventBus";

export default {
  data() {
    return {
      sources: [],
      sourceItems: [],
      selectedIndex: -1,
      selectedSource: "",
      sourceLabels: [],
      menuOpened: true,
      sourceCounts: [],
    };
  },
  async created() {
    this.loadSources();
    this.loadSourcesCounts();
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
      const sourceId = this.sourceLabels[index].sourceId;
      this.selectedSource = sourceId;
      this.selectedIndex = index;
      this.sourceItems = [];
      await Timeout.wait(10);
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/items`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceItems = res.data.sourceItems;
        })
        .catch(handleError);
    },
    async loadLabelItems(index) {
      const label = this.sourceLabels[index].labelName;
      this.selectedSource = null;
      this.selectedIndex = index;
      this.sourceItems = [];
      await Timeout.wait(10);
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels/${label}/items`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceItems = res.data.sourceItems;
        })
        .catch(handleError);
    },
    async loadAllItems() {
      this.selectedSource = null;
      this.selectedIndex = -3;
      this.sourceItems = [];
      await Timeout.wait(10);
      await axios
        .get(`${(await Config.get()).SERVER_URL}/items`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceItems = res.data.sourceItems;
        })
        .catch(handleError);
    },
    async loadSavedItems(index) {
      this.selectedSource = null;
      this.selectedIndex = -2;
      this.sourceItems = [];
      await Timeout.wait(10);
      await axios
        .get(`${(await Config.get()).SERVER_URL}/lists/items`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceItems = res.data.sourceItems;
        })
        .catch(handleError);
    },
    async refreshSourceItems(sourceId) {
      this.selectedSource = sourceId;
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
    },
    async markAllRead() {
      if (confirm("Mark all item read?") == true) {
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
    openListMenu() {
      this.menuOpened = !this.menuOpened;
    },
    onItemsUpdated(item) {
      this.loadSourcesCounts();
    },
  },
};
</script>

<style scoped>
#sources-layout > * {
  min-height: 0px;
}
#sources-actions {
  text-align: right;
  padding-top: 0.5em;
}
#sources-list div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 700px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 4em auto 2em 2fr;
    grid-template-columns: 1fr 1fr;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 3;
    grid-column-start: 1;
    grid-column-end: span 2;
    text-align: right;
  }
  #sources-items-list {
    overflow: scroll;
    grid-row: 4;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column: 1;
  }
  #sources-list {
    overflow: auto;
    height: 30vh;
    grid-row: 2;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  .sources-list-closed {
    height: 0px !important;
  }
}

@media (min-width: 701px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 4em 2em 1fr;
    grid-template-columns: auto 1fr 1fr;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 2;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-items-list {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-list {
    width: 30vw;
    max-width: 20em;
    overflow: auto;
    height: auto;
    grid-row-start: 2;
    grid-row-end: span 2;
    grid-column: 1;
  }
  .sources-actions-menu-toggle {
    visibility: hidden;
  }
}

@media (prefers-color-scheme: dark) {
  .source-active {
    background-color: #333;
  }
  #sources-list {
    background-color: #33333333;
  }
}
@media (prefers-color-scheme: light) {
  .source-active {
    background-color: #bbb;
  }
  #sources-list {
    background-color: #aaaaaa33;
  }
}

.source-name-layout {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0.3em 0.5em;
}
.source-name-name {
  grid-column: 1;
}
.source-name-count {
  grid-column: 2;
}
</style>
