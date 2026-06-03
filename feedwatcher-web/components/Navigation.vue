<template>
  <nav>
    <ul class="menu-links">
      <li>
        <NuxtLink to="/" class="brand-link"
          ><img src="/icon.png" alt="FeedWatcher" class="nav-logo" />
          <strong>FeedWatcher</strong></NuxtLink
        >
      </li>
    </ul>
    <ul class="menu-links">
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/sources"
          :class="activeRoute == 'sources' ? 'active' : 'inactive'"
          ><i class="bi bi-rss-fill"></i>
          <span class="nav-label">Sources</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/bookmarks"
          :class="activeRoute == 'bookmarks' ? 'active' : 'inactive'"
          ><i class="bi bi-bookmark-check-fill"></i>
          <span class="nav-label">Bookmarks</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/rules"
          :class="activeRoute == 'rules' ? 'active' : 'inactive'"
          ><i class="bi bi-robot"></i>
          <span class="nav-label">Rules</span></NuxtLink
        >
      </li>
      <li>
        <NuxtLink
          to="/users"
          :class="activeRoute == 'users' ? 'active' : 'inactive'"
          ><i class="bi bi-person-circle"></i>
          <span class="nav-label">Users</span></NuxtLink
        >
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { AuthService } from "~~/services/AuthService";
import { PreferencesService } from "~/services/PreferencesService";
const authenticationStore = AuthenticationStore();
</script>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";

export default {
  watch: {
    $route(to, from) {
      this.routeUpdated(to);
    },
  },
  data() {
    return {
      activeRoute: "",
    };
  },
  async created() {
    this.routeUpdated(this.$route);
    if (await AuthenticationStore().ensureAuthenticated()) {
      setTimeout(async () => {
        // Renew session tocken
        axios
          .post(
            `${(await Config.get()).SERVER_URL}/users/session`,
            {},
            await AuthService.getAuthHeader(),
          )
          .then((res) => {
            AuthService.saveToken(res.data.token);
          });
      }, 10000);
    }
    UserProcessorInfoStore().check();
    PreferencesService.applyTheme();
  },
  methods: {
    routeUpdated(newRoute) {
      this.activeRoute = newRoute.fullPath.split("/")[1];
    },
  },
};
</script>

<style scoped>
.menu-links li {
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
}
.menu-links li {
  padding-right: var(--space-base);
}
.menu-links .inactive {
  opacity: 0.3;
}
.menu-links .active {
  color: var(--color-primary);
}
.menu-links {
  font-weight: bold;
}

.nav-logo {
  height: 1.4em;
  vertical-align: middle;
  margin-right: var(--space-sm);
}

.menu-links i {
  margin-right: var(--space-sm);
}

/* Hide nav labels on narrow screens */
@media (max-width: 1000px) {
  .nav-label {
    display: none;
  }
}

:root[data-theme="light"] .menu-links .inactive {
  opacity: 0.8;
}
:root[data-theme="light"] .menu-links .active {
  color: var(--color-primary-dark);
}
</style>
