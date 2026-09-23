<template>
  <div class="settings-tab-content">
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
          <i class="bi bi-card-heading"></i>
          <span>Open Source Details</span>
        </div>
        <div class="preference-control">
          <select
            v-model="openDetailsMode"
            @change="changeOpenDetailsMode"
            class="preference-select"
          >
            <option value="expand">Expand</option>
            <option value="dialog-summary">Dialog (Summary)</option>
            <option value="dialog-full">Dialog (Full Source)</option>
            <option value="external">Open External Link</option>
          </select>
        </div>
      </div>

      <div class="preference-row">
        <div class="preference-label">
          <i class="bi bi-link-45deg"></i>
          <span>Open Source Link</span>
        </div>
        <div class="preference-control">
          <select
            v-model="openLinksMode"
            @change="changeOpenLinksMode"
            class="preference-select"
          >
            <option value="dialog-summary">Dialog (Summary)</option>
            <option value="dialog-full">Dialog (Full Source)</option>
            <option value="external">Open External Link</option>
          </select>
        </div>
      </div>
    </article>
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
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
      isChangePasswordStarted: false,
      isDark,
      autoMarkRead: PreferencesService.isAutoMarkReadEnabled(),
      openDetailsMode: PreferencesService.getOpenDetailsMode(),
      openLinksMode: PreferencesService.getOpenLinksMode(),
    };
  },
  methods: {
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
      useRouter().push({ path: "/login" });
    },
    changePasswordStart(enable) {
      this.isChangePasswordStarted = enable;
      this.user = {};
    },
    changeOpenDetailsMode() {
      PreferencesService.setOpenDetailsMode(this.openDetailsMode);
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
