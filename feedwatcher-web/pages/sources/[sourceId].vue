<template>
  <div>
    <h1>Update Source: {{ source.info.url }}</h1>
    <label>Name</label>
    <input v-model="source.name" type="text" />
    <button v-on:click="updateSource()">Update</button>
    <button v-on:click="deleteSource()">Delete</button>
    <h1>{{ $route.params.sourceId }}</h1>
  </div>
</template>

<script>
import axios from "axios";
import Config from "../../services/Config.ts";
import { AuthService } from "../../services/AuthService";
import { handleError, EventBus, EventTypes } from "../../services/EventBus";

export default {
  data() {
    return {
      source: { info: {} },
    };
  },
  async created() {
    await axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}`,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        this.source = res.data;
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "info",
          text: "Source added",
        });
      })
      .catch(handleError);
  },
  methods: {
    async updateSource() {
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
              text: "Source added",
            });
            router.push({ path: "/" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "URL missing",
        });
      }
    },
    async deleteSource() {
      if (confirm("Delete the source?") == true) {
        await axios
          .delete(`${(await Config.get()).SERVER_URL}/sources/${this.source.id}`, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Source deleted",
            });
            router.push({ path: "/" });
          })
          .catch(handleError);
      }
    },
  },
};
</script>
