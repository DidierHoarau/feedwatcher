<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h1>Sources</h1>
    </div>
    <div id="sources-actions" class="actions">
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
    </div>
    <div id="sources-list">
      <div v-for="source in sources" v-bind:key="source.id" v-on:click="loadSourceItems(source.id)">
        {{ source.name }}
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
import Config from "../../services/Config.ts";
import { AuthService } from "../../services/AuthService";
import { handleError, EventBus, EventTypes } from "../../services/EventBus";

export default {
  name: "UserEdit",
  props: {
    userId: String,
  },
  data() {
    return {
      sources: [],
      sourceItems: [],
      selectedSource: "",
    };
  },
  async created() {
    this.loadSources();
  },
  methods: {
    async loadSources() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sources = res.data.sources;
        })
        .catch(handleError);
    },
    async loadSourceItems(sourceId) {
      this.selectedSource = sourceId;
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/items`, await AuthService.getAuthHeader())
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
  },
};
</script>

<style scoped>
#sources-layout {
  display: grid;
  grid-template-rows: 4em 2em 1fr;
  grid-template-columns: 10em 1fr 1fr;
  height: calc(100vh - 5em);
}
#sources-layout > * {
  min-height: 0px;
}
#sources-header {
  grid-row: 1;
  grid-column-start: 1;
  grid-column-end: span 2;
}
#sources-list {
  overflow: auto;
  height: auto;
  grid-row-start: 2;
  grid-row-end: span 2;
  grid-column: 1;
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
</style>
