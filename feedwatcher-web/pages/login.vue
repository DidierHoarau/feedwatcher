<template>
  <div id="login-page" class="settings-auth-content">
    <article class="settings-card">
      <header>
        <h4 v-if="isInitialized">
          <i class="bi bi-box-arrow-in-right"></i> Login
        </h4>
        <h4 v-else><i class="bi bi-person-plus"></i> New User</h4>
      </header>
      <label>
        Username
        <input v-model="user.name" type="text" placeholder="Enter username" />
      </label>
      <label>
        Password
        <input
          v-model="user.password"
          type="password"
          placeholder="Enter password"
        />
      </label>
      <footer>
        <button v-if="isInitialized" @click="login()">
          <i class="bi bi-box-arrow-in-right"></i> Login
        </button>
        <button v-else @click="saveNew()">
          <i class="bi bi-person-plus"></i> Create
        </button>
      </footer>
    </article>
    <article v-if="isInitialized && loginCodeAvailable" class="settings-card">
      <LoginWithCodeCard
        :service="loginCodeService"
        variant="plain"
        :heading-level="3"
        @approved="onLoginCodeApproved"
      />
    </article>
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import { UserService } from "~~/services/UserService";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import {
  LoginCodesServiceCreate,
  LoginCodesIsAvailable,
} from "~~/services/LoginCodes";

export default {
  components: {
    LoginWithCodeCard,
  },
  data() {
    return {
      user: {},
      isInitialized: true,
      loginCodeService: LoginCodesServiceCreate(),
      loginCodeAvailable: false,
    };
  },
  async created() {
    this.isInitialized = await UserService.isInitialized();
    this.loginCodeAvailable = await LoginCodesIsAvailable(
      this.loginCodeService,
    );
  },
  methods: {
    async saveNew() {
      if (this.user.name && this.user.password) {
        await axios
          .post(
            `${(await Config.get()).SERVER_URL}/users`,
            this.user,
            await AuthService.getAuthHeader(),
          )
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
          .post(
            `${(await Config.get()).SERVER_URL}/users/session`,
            this.user,
            await AuthService.getAuthHeader(),
          )
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
    onLoginCodeApproved() {
      // The login-code service already persisted the token via onSession.
      AuthenticationStore().isAuthenticated = true;
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        type: "info",
        text: "User Logged In",
      });
      UserProcessorInfoStore().check();
      useRouter().push({ path: "/sources" });
    },
  },
};
</script>

<style scoped>
#login-page {
  height: 100%;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xl, 1.5em);
}
</style>
