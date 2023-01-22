<template>
  <div id="sources-layout">
    <h1>Sources</h1>
    <div id="sources-header">
      <NuxtLink to="/sources/edit">Add Source</NuxtLink>
    </div>
    <div id="sources-list">
      <div v-for="source in sources" v-bind:key="source.id" v-on:click="loadSourceItems(source.id)">
        {{ source.name }}
      </div>
    </div>
    <div id="sources-items-list">
      <div v-for="sourceItem in sourceItems" v-bind:key="sourceItem.id">
        {{ sourceItem }}
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
  grid-template-row: 3em 1fr;
  grid-template-columns: 10em 1fr;
}
#sources-items-list {
  overflow: scroll;
  height: auto;
}
</style>
