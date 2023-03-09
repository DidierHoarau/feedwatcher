<template>
  <div class="user-page">
    <div v-if="!authenticationStore.isAuthenticated">
      <h1 v-if="isInitialized">Login</h1>
      <h1 v-else>New User</h1>
      <label>Name</label>
      <input id="username" v-model="user.name" type="text" />
      <label>Password</label>
      <input id="passwrd" v-model="user.password" type="password" />
      <button v-if="!authenticationStore.isAuthenticated && !isInitialized" v-on:click="saveNew()">Create</button>
      <button v-if="!authenticationStore.isAuthenticated && isInitialized" v-on:click="login()">Login</button>
    </div>
    <div v-else>
      <h1>Import/Export Sources</h1>
      <button v-on:click="gotoImport()">Import Sources (OPML)</button>
      <button v-on:click="gotoExport()">Export Sources (OPML)</button>
      <br />
      <h1>Authentication</h1>
      <button v-on:click="logout()">Logout</button>
      <button v-if="!isChangePasswordStarted" v-on:click="changePasswordStart(true)">Change Password</button>
      <article v-else>
        <h1>Change Password</h1>
        <label>Old Password</label>
        <input id="password" v-model="user.passwordOld" type="password" />
        <label>New Password</label>
        <input id="passwordOld" v-model="user.password" type="password" />
        <button v-on:click="changePassword()">Change</button>
        <button v-on:click="changePasswordStart(false)">Cancel</button>
      </article>
    </div>
  </div>
</template>

<script setup>
const authenticationStore = AuthenticationStore();
</script>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import { UserService } from "~~/services/UserService";

export default {
  data() {
    return {
      user: {},
      isInitialized: true,
      isChangePasswordStarted: false,
    };
  },
  async created() {
    this.isInitialized = await UserService.isInitialized();
    AuthenticationStore().isAuthenticated = await AuthService.isAuthenticated();
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
            this.isInitialized = true;
            this.login();
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
            AuthenticationStore().isAuthenticated = true;
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "User Logged In",
            });
            UserProcessorInfoStore().check();
            useRouter().push({ path: "/sources" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Username or password missing",
        });
      }
    },
    async changePassword() {
      if (this.user.password && this.user.passwordOld) {
        await axios
          .put(`${(await Config.get()).SERVER_URL}/users/password`, this.user, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Password Changed",
            });
            this.isChangePasswordStarted = false;
            this.user = {};
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Password missing",
        });
      }
    },
    async logout() {
      AuthService.removeToken();
      AuthenticationStore().isAuthenticated = false;
    },
    changePasswordStart(enable) {
      this.isChangePasswordStarted = enable;
      this.user = {};
    },
    gotoImport() {
      useRouter().push({ path: "/sources/import" });
    },
    async gotoExport() {
      const headers = await AuthService.getAuthHeader();
      headers.responseType = 'blob';      
      axios
        .get(`${(await Config.get()).SERVER_URL}/sources/import/export/opml`, headers)
        .then((response) => {
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `sources_export_${new Date().toISOString()}.opml`);
          document.body.appendChild(link);
          link.click();
        })
        .catch(handleError);
    },
  },
};
</script>

<style scoped>
.user-page {
  width: min(100%, 50em);
}
</style>
