<template>
  <div>
    <h1>Sources</h1>
    <NuxtLink to="/sources/edit">Add Source</NuxtLink>
    <div v-for="source in sources" v-bind:key="source.id">{{ source }}</div>
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
  },
};
</script>
