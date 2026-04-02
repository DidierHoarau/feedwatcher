<template>
  <div>
    <h1>New Source</h1>
    <label>URL</label>
    <input v-model="source.url" type="text" />
    <div v-if="alreadyExists" class="source-exists-warning">
      <i class="bi bi-exclamation-triangle-fill"></i>
      This source already exists
    </div>
    <button v-if="!loading" v-on:click="saveNew()">Add</button>
    <Loading v-if="loading" />
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      loading: false,
      source: {},
    };
  },
  computed: {
    alreadyExists() {
      const url = this.source.url?.trim();
      if (!url) return false;
      return SourcesStore().sources.some(
        (s) => !s.isLabel && s.sourceInfo?.url === url,
      );
    },
  },
  async created() {
    SourcesStore().fetch();
  },
  methods: {
    async saveNew() {
      if (this.source.url) {
        this.loading = true;
        await axios
          .post(
            `${(await Config.get()).SERVER_URL}/sources`,
            this.source,
            await AuthService.getAuthHeader(),
          )
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

<style scoped>
.source-exists-warning {
  color: #e6a817;
  font-size: 0.85em;
  margin-top: 0.3em;
  margin-bottom: 1em;
}
</style>
