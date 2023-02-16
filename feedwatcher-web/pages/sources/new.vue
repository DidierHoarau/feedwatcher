<template>
  <div>
    <h1>New Source</h1>
    <label>URL</label>
    <input v-model="source.url" type="text" />
    <button v-on:click="saveNew()">Add</button>
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
      source: {},
    };
  },
  async created() {},
  methods: {
    async saveNew() {
      if (this.source.url) {
        await axios
          .post(`${(await Config.get()).SERVER_URL}/sources`, this.source, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Source added",
            });
            const router = useRouter();
            router.push({ path: "/sources" });
          })
          .catch(handleError);
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
