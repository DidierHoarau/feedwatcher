<template>
  <div>
    <h1>New Source</h1>
    <label>URL</label>
    <input v-model="source.url" type="text" />
    <button v-if="!loading" v-on:click="saveNew()">Add</button>
    <Loading v-if="loading" />
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import SourceId from "./[sourceId].vue";

export default {
  data() {
    return {
      loading: false,
      source: {},
    };
  },
  async created() {},
  methods: {
    async saveNew() {
      if (this.source.url) {
        this.loading = true;
        await axios
          .post(`${(await Config.get()).SERVER_URL}/sources`, this.source, await AuthService.getAuthHeader())
          .then(async (res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Source added",
            });
            await SourcesStore().fetch();
            const router = useRouter();
            router.push({ path: "/sources", query: { sourceId: res.data.id } });
          })
          .catch(handleError);
        this.loading = false;
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "URL missing",
        });
      }
    },
  },
};
</script>
