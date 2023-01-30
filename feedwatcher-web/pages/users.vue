<template>
  <div>
    <div v-if="!isAuthenticated">
      <h1 v-if="isInitialized">Login</h1>
      <h1 v-else>New User</h1>

      <label>Name</label>
      <input v-model="user.name" type="text" />

      <label>Password</label>
      <input v-model="user.password" type="password" />

      <button v-if="!isAuthenticated && !isInitialized" v-on:click="saveNew()">Create</button>
      <button v-if="!isAuthenticated && isInitialized" v-on:click="login()">Login</button>
    </div>
    <div v-else>
      <button v-on:click="logout()">Logout</button>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import Config from "../services/Config.ts";
import { AuthService } from "../services/AuthService";
import { handleError, EventBus, EventTypes } from "../services/EventBus";
import { UserService } from "../services/UserService";

export default {
  name: "UserEdit",
  props: {
    userId: String,
  },
  data() {
    return {
      user: {},
      isInitialized: true,
      isAuthenticated: false,
    };
  },
  async created() {
    this.isInitialized = await UserService.isInitialized();
    this.isAuthenticated = await AuthService.isAuthenticated();
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
            const router = useRouter();
            router.push({ path: "/" });
            this.isInitialized = true;
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username or password missing",
        });
      }
    },
    async login() {
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
            const router = useRouter();
            router.push({ path: "/sources" });
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
