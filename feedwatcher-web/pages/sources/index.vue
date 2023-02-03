<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h1>Sources</h1>
    </div>
    <div id="sources-actions" class="actions">
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
    </div>
    <div id="sources-list">
      <div v-for="(sourceLabel, index) in sourceLabels" v-bind:key="sourceLabel.labelName">
        <div
          v-on:click="loadLabelItems(index)"
          v-if="isLabelDisplayed(index)"
          :class="{ 'source-active': index == selectedIndex && !selectedSource }"
        >
          <i class="bi bi-caret-down-fill"></i>
          {{ sourceLabel.labelName }}
        </div>
        <div v-on:click="loadSourceItems(index)" :class="{ 'source-active': index == selectedIndex && selectedSource }">
          <span v-html="getSourceIndentation(index)"></span>
          <i v-if="sourceLabel.sourceInfo.icon" :class="'bi bi-' + sourceLabel.sourceInfo.icon"></i>
          {{ sourceLabel.sourceName }}
        </div>
      </div>
    </div>
    <div id="sources-items-actions" v-if="selectedSource" class="actions">
      <NuxtLink :to="'/sources/' + selectedSource"><i class="bi bi-pencil-square"></i></NuxtLink>
      <i v-on:click="refreshSourceItems(selectedSource)" class="bi bi-arrow-clockwise"></i>
      <i class="bi bi-card-checklist"></i>
    </div>
    <div id="sources-items-list">
      <div v-for="sourceItem in sourceItems" v-bind:key="sourceItem.id">
        <SourceItem :item="sourceItem" />
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
    };
  },
  async created() {
    this.loadSources();
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
    async refreshSourceItems(sourceId) {
      this.selectedSource = sourceId;
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
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
    getSourceIndentation(index) {
      if (!this.sourceLabels[index].labelName) {
        return "";
      }
      let indentation = "";
      for (const count in this.sourceLabels[index].labelName.split("/")) {
        indentation += "&nbsp;&nbsp;&nbsp;&nbsp;";
      }
      return indentation;
    },
  },
};
</script>

<style scoped>
#sources-layout {
  display: grid;
  grid-template-rows: 4em 2em 1fr;
  grid-template-columns: 10em 1fr 1fr;
  height: calc(100vh - 5em);
  column-gap: 1em;
}
#sources-layout > * {
  min-height: 0px;
}
#sources-header {
  grid-row: 1;
  grid-column-start: 1;
  grid-column-end: span 2;
}
#sources-actions {
  text-align: right;
  padding-top: 0.5em;
}
#sources-list {
  overflow: auto;
  height: auto;
  grid-row-start: 2;
  grid-row-end: span 2;
  grid-column: 1;
}
#sources-list div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: 0.5em;
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
.source-active {
  background-color: #333;
}
</style>
