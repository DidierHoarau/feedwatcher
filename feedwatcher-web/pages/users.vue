<template>
  <div id="settings-page">
    <!-- Unauthenticated: Login / Register -->
    <div
      v-if="!authenticationStore.isAuthenticated"
      class="settings-auth-content"
    >
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
    </div>

    <!-- Authenticated -->
    <div v-else class="settings-authenticated-content">
      <!-- Data Management -->
      <article class="settings-card">
        <header>
          <h4><i class="bi bi-diagram-3"></i> Import / Export Sources</h4>
        </header>
        <div class="settings-card-actions">
          <button @click="gotoImport()">
            <i class="bi bi-upload"></i> Import OPML
          </button>
          <button @click="gotoExport()">
            <i class="bi bi-download"></i> Export OPML
          </button>
        </div>
      </article>

      <!-- Account -->
      <article class="settings-card">
        <header>
          <h4><i class="bi bi-shield-lock"></i> Account</h4>
        </header>

        <div v-if="!isChangePasswordStarted" class="settings-card-actions">
          <button @click="changePasswordStart(true)">
            <i class="bi bi-key"></i> Change Password
          </button>
          <button class="contrast" @click="logout()">
            <i class="bi bi-box-arrow-right"></i> Logout
          </button>
        </div>

        <div v-else class="change-password-form">
          <label>
            Old Password
            <input
              v-model="user.passwordOld"
              type="password"
              placeholder="Enter current password"
            />
          </label>
          <label>
            New Password
            <input
              v-model="user.password"
              type="password"
              placeholder="Enter new password"
            />
          </label>
          <div class="settings-card-actions">
            <button class="secondary" @click="changePasswordStart(false)">
              Cancel
            </button>
            <button @click="changePassword()">
              <i class="bi bi-check-lg"></i> Change
            </button>
          </div>
        </div>
      </article>

      <!-- Preferences -->
      <article class="settings-card">
        <header>
          <h4><i class="bi bi-sliders"></i> Preferences</h4>
        </header>

        <div class="preference-row">
          <div class="preference-label">
            <i class="bi bi-moon-stars"></i>
            <span>Dark Mode</span>
          </div>
          <div class="preference-control">
            <button @click="toggleTheme" class="icon-btn">
              <i :class="isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill'"></i>
              {{ isDark ? "Light" : "Dark" }}
            </button>
          </div>
        </div>

        <div class="preference-row">
          <div class="preference-label">
            <i class="bi bi-envelope-open"></i>
            <span>Auto-mark as read</span>
          </div>
          <div class="preference-control">
            <label class="switch-label">
              <input
                type="checkbox"
                v-model="autoMarkRead"
                @change="toggleAutoMarkRead"
              />
              Mark items as read when scrolling out of view
            </label>
          </div>
        </div>

        <div class="preference-row">
          <div class="preference-label">
            <i class="bi bi-link-45deg"></i>
            <span>Open Sources</span>
          </div>
          <div class="preference-control">
            <select
              v-model="openLinksMode"
              @change="changeOpenLinksMode"
              class="preference-select"
            >
              <option value="external">Open Links</option>
              <option value="dialog-summary">Dialog (Summary)</option>
              <option value="dialog-full">Dialog (Full Source)</option>
            </select>
          </div>
        </div>
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
import { PreferencesService } from "~~/services/PreferencesService";

export default {
  data() {
    let isDark = false;
    const storedTheme = localStorage.getItem("UI_THEME");
    if (storedTheme === "dark" || storedTheme === "light") {
      isDark = storedTheme === "dark";
    } else {
      isDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return {
      user: {},
      isInitialized: true,
      isChangePasswordStarted: false,
      isDark,
      autoMarkRead: PreferencesService.isAutoMarkReadEnabled(),
      openLinksMode: PreferencesService.getOpenLinksMode(),
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
    async changePassword() {
      if (this.user.password && this.user.passwordOld) {
        await axios
          .put(
            `${(await Config.get()).SERVER_URL}/users/password`,
            this.user,
            await AuthService.getAuthHeader(),
          )
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
      headers.responseType = "blob";
      axios
        .get(
          `${(await Config.get()).SERVER_URL}/sources/import/export/opml`,
          headers,
        )
        .then((response) => {
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute(
            "download",
            `sources_export_${new Date().toISOString()}.opml`,
          );
          document.body.appendChild(link);
          link.click();
        })
        .catch(handleError);
    },
    changeOpenLinksMode() {
      PreferencesService.setOpenLinksMode(this.openLinksMode);
    },
    toggleTheme() {
      PreferencesService.toggleTheme(this);
    },
    toggleAutoMarkRead() {
      this.autoMarkRead = PreferencesService.toggleAutoMarkRead();
    },
  },
};
</script>

<style scoped>
#settings-page {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  max-width: 50em;
}

/* Auth (login/register) */
.settings-auth-content {
  display: flex;
  justify-content: center;
  padding-top: var(--space-2xl);
}

.settings-auth-content .settings-card {
  width: min(100%, 28em);
}

.settings-authenticated-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-base) 0;
}

.settings-card {
  margin: 0;
}

.settings-card header h4 {
  margin: 0;
  font-size: 1.1em;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.settings-card header h4 i {
  font-size: var(--font-xl);
}

.settings-card-actions {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.settings-card-actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

/* Change password form */
.change-password-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* Preference rows */
.preference-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) 0;
  gap: var(--space-base);
}

.preference-row + .preference-row {
  border-top: 1px solid var(--pico-muted-border-color, var(--color-border));
}

.preference-label {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-weight: 500;
}

.preference-label i {
  font-size: var(--font-xl);
  opacity: 0.8;
}

.preference-control {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Icon button for dark mode */
.icon-btn {
  background: none;
  border: 1px solid var(--pico-muted-border-color, var(--color-border));
  cursor: pointer;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--pico-border-radius);
  color: var(--pico-color);
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-body);
}

.icon-btn:hover {
  background: var(
    --pico-card-sectioning-background-color,
    rgba(255, 255, 255, 0.05)
  );
  border-color: var(--pico-primary);
}

/* Checkbox switch label */
.switch-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-body);
  cursor: pointer;
  white-space: normal;
  word-break: break-word;
}

.switch-label input[type="checkbox"] {
  width: 1.2em;
  height: 1.2em;
  cursor: pointer;
}

.preference-select {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-body);
  cursor: pointer;
}

.preference-select:hover {
  border-color: var(--color-border-hover);
}
</style>
