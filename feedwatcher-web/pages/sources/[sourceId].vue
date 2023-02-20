<template>
  <div>
    <h1>Update Source: {{ source.info.url }}</h1>
    <label>Name</label>
    <input v-model="source.name" type="text" />
    <label>Labels (coma separated)</label>
    <input v-model="labels" type="text" />
    <button v-on:click="updateSource()">Update</button>
    <button v-on:click="deleteSource()">Delete</button>
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
      source: { info: {} },
      labels: "",
    };
  },
  async created() {
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}`,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        this.source = res.data;
      })
      .catch(handleError);
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}/labels`,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        this.labels = "";
        for (const label of res.data.labels) {
          if (this.labels) {
            this.labels += ", ";
          }
          this.labels += label.name;
        }
      })
      .catch(handleError);
  },
  methods: {
    async updateSource() {
      const sourceLabels = [];
      for (const label of this.labels.split(",")) {
        if (label.trim()) {
          sourceLabels.push(label.trim());
        }
      }
      this.source.labels = sourceLabels;
      if (this.source.name) {
        await axios
          .put(
            `${(await Config.get()).SERVER_URL}/sources/${this.source.id}`,
            this.source,
            await AuthService.getAuthHeader()
          )
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Source updated",
            });
            return SourcesStore().fetch();
          })
          .then(() => {
            SourcesStore().selectSource(this.source.id);
            useRouter().push({ path: "/sources" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Name missing",
        });
      }
    },
    async deleteSource() {
      if (confirm("Delete the source?") == true) {
        await axios
          .delete(`${(await Config.get()).SERVER_URL}/sources/${this.source.id}`, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              text: "Source deleted",
            });
            SourcesStore().selectSource("");
            SourcesStore().selectedIndex = 0;
            useRouter().push({ path: "/sources" });
          })
          .catch(handleError);
      }
    },
  },
};
</script>

<style scoped>
h1 {
  word-break: break-all;
}
</style>
