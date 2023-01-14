<template>
  <div class="page_content_container">
    <h1 v-if="userId">Update User</h1>
    <h1 v-else>New User</h1>

    <label class="form-label">Name</label>
    <input v-model="user.name" type="text" class="form-control" />

    <div v-if="userId" class="form-check form-switch formSection">
      <input
        class="form-check-input checkbox"
        type="checkbox"
        v-model="passwordEnabled"
        v-on:click="passwordSwitch()"
        id="flexSwitchCheckDefault"
      />
      <label class="form-label">Password</label>
    </div>
    <label v-if="!userId" class="form-label">Password</label>
    <input v-model="user.password" type="password" class="form-control" :disabled="!passwordEnabled" />

    <br />
    <button v-if="userId" v-on:click="saveUpdate()" class="btn btn-primary">Save</button>&nbsp;
    <button v-if="userId" v-on:click="remove()" class="btn btn-primary">Delete</button>
    <button v-if="!userId" v-on:click="saveNew()" class="btn btn-primary">Save</button>
  </div>
</template>

<script>
import axios from "axios";
import Config from "../services/Config.ts";
import { AuthService } from "../services/AuthService";
import { handleError, EventBus, EventTypes } from "../services/EventBus";

export default {
  name: "UserEdit",
  props: {
    userId: String,
  },
  data() {
    return {
      user: {},
      passwordEnabled: false,
    };
  },
  async created() {
    if (this.userId) {
      this.passwordEnabled = false;
      axios
        .get(`${(await Config.get()).SERVER_URL}/users/${this.userId}`, await AuthService.getAuthHeader())
        .then((res) => {
          this.user = res.data;
        })
        .catch(handleError);
    } else {
      this.passwordEnabled = true;
    }
  },
  methods: {
    async saveNew() {
      if (this.user.name && this.user.password) {
        await axios
          .post(`${(await Config.get()).SERVER_URL}/users`, this.user, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "User created",
            });
            router.push({ path: "/users" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username or password missing",
        });
      }
    },

    async saveUpdate() {
      if (!this.user.name) {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username missing",
        });
      } else if (this.passwordEnabled && !this.user.password) {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username missing",
        });
      } else {
        axios
          .put(`${(await Config.get()).SERVER_URL}/users/${this.userId}`, this.user, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "User updated",
            });
          })
          .catch(handleError);
      }
    },

    async remove() {
      const confirmation = confirm("Delete the user?");
      if (confirmation == true) {
        axios
          .delete(`${(await Config.get()).SERVER_URL}/users/${this.userId}`, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Users Deleted",
            });
            router.push({ path: "/users" });
          })
          .catch(handleError);
      }
    },
  },
};
</script>
