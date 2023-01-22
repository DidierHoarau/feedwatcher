<template>
  <div>
    <h1 v-if="isNew">New Source</h1>
    <h1 v-else>Edit Source</h1>

    <label>URL</label>
    <input v-model="source.url" type="text" />

    <button v-if="isNew" v-on:click="saveNew()">Add</button>
    <button v-else v-on:click="saveUpdate()">Update</button>
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
      source: {},
      isNew: true,
    };
  },
  async created() {
    // if (await AuthService.isAuthenticated()) {
    // }
  },
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
    async saveUpdate() {
      if (this.user.name && this.user.password) {
        await axios
          .post(`${(await Config.get()).SERVER_URL}/users/session`, this.user, await AuthService.getAuthHeader())
          .then((res) => {
            AuthService.saveToken(res.data.token);
            this.isAuthenticated = true;
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "User Logged In",
            });
            router.push({ path: "/" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username or password missing",
        });
      }
    },
    async logout() {
      AuthService.removeToken();
      this.isAuthenticated = false;
    },
  },
};
</script>
