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
          aria-label="Sources"
          ><i class="bi bi-rss-fill"></i>
          <span class="nav-label">Sources</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/bookmarks"
          :class="activeRoute == 'bookmarks' ? 'active' : 'inactive'"
          aria-label="Bookmarks"
          ><i class="bi bi-bookmark-check-fill"></i>
          <span class="nav-label">Bookmarks</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/rules"
          :class="activeRoute == 'rules' ? 'active' : 'inactive'"
          aria-label="Rules"
          ><i class="bi bi-robot"></i>
          <span class="nav-label">Rules</span></NuxtLink
        >
      </li>
      <li v-if="playerStore.hasActiveItem">
        <NuxtLink
          :to="{
            path: '/podcast',
            query: { itemId: playerStore.currentItem?.id },
          }"
          :class="activeRoute == 'podcast' ? 'active' : 'inactive'"
          aria-label="Podcast player"
          ><i class="bi bi-headphones"></i>
          <span class="nav-label">Podcast</span></NuxtLink
        >
      </li>
      <li>
        <NuxtLink
          to="/users"
          :class="activeRoute == 'users' ? 'active' : 'inactive'"
          aria-label="Account and settings"
          ><i class="bi bi-person-fill"></i>
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
const playerStore = PodcastPlayerStore();
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

/* Hide nav labels on tablet screens (mobile shows a labeled bottom tab bar) */
@media (min-width: 701px) and (max-width: 1000px) {
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

/* ---------- Mobile: bottom tab bar ---------- */
@media (max-width: 700px) {
  nav {
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    min-height: 3.5rem;
    margin: 0;
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    border-top: 1px solid var(--color-border);
    background-color: var(--color-bg);
    box-shadow: 0 -2px 10px var(--color-shadow-sm);
  }
  .menu-links {
    display: flex;
    flex: 1;
    align-items: stretch;
    justify-content: space-around;
    margin: 0;
    padding: 0;
  }
  .menu-links:first-of-type {
    display: none;
  }
  .menu-links li {
    display: flex;
    flex: 1;
    margin: 0;
    padding: 0;
  }
  .menu-links li a {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 3.5rem;
    padding: var(--space-xs) 0;
    box-sizing: border-box;
    text-decoration: none;
  }
  .menu-links i {
    margin-right: 0;
    font-size: 1.25rem;
    line-height: 1;
    padding: 2px 16px;
    border-radius: var(--radius-full);
  }
  .nav-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .menu-links .inactive {
    opacity: 1;
    color: var(--color-text-muted);
  }
  .menu-links .active {
    color: var(--color-primary);
    opacity: 1;
  }
  .menu-links .active i {
    background-color: var(--color-primary-light);
  }
  :root[data-theme="light"] .menu-links .inactive {
    /* color-text-muted (#78909c) is only ~3.35:1 on white — below WCAG AA 4.5:1 for 0.7rem labels */
    color: var(--color-text-secondary);
    opacity: 1;
  }
  :root[data-theme="light"] .menu-links .active {
    color: var(--color-primary-dark);
  }
}
</style>
