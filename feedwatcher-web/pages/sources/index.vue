<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h1>Sources</h1>
    </div>
    <div id="sources-actions">
      <NuxtLink to="/sources/edit">Add Source</NuxtLink>
    </div>
    <div id="sources-list">
      <div v-for="source in sources" v-bind:key="source.id" v-on:click="loadSourceItems(source.id)">
        {{ source.name }}
      </div>
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
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/items`, await AuthService.getAuthHeader())
        .then((res) => {
          console.log(res.data);
          this.sourceItems = res.data.sourceItems;
        })
        .catch(handleError);
    },
  },
};
</script>

<style scoped>
#sources-layout {
  display: grid;
  grid-template-rows: 4em 1fr;
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
  grid-row: 2;
  grid-column: 1;
}
#sources-items-list {
  overflow: auto;
  grid-row: 2;
  grid-column-start: 2;
  grid-column-end: span 2;
}
</style>
