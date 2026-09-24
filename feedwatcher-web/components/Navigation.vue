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
          to="/"
          :class="activeRoute == '' ? 'active' : 'inactive'"
          aria-label="Dashboard"
          ><span class="nav-icon"><i class="bi bi-house-fill"></i></span>
          <span class="nav-label">Dashboard</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/sources"
          :class="activeRoute == 'sources' ? 'active' : 'inactive'"
          :aria-label="
            unreadCount > 0
              ? `Sources, ${unreadCount} unread`
              : 'Sources'
          "
          ><span class="nav-icon"
            ><i class="bi bi-rss-fill"></i>
            <span v-if="unreadCount > 0" class="nav-count" aria-hidden="true">{{
              unreadCount
            }}</span></span
          >
          <span class="nav-label">Sources</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/bookmarks"
          :class="activeRoute == 'bookmarks' ? 'active' : 'inactive'"
          :aria-label="
            bookmarkedCount > 0
              ? `Bookmarks, ${bookmarkedCount} bookmarked`
              : 'Bookmarks'
          "
          ><span class="nav-icon"
            ><i class="bi bi-bookmark-check-fill"></i>
            <span
              v-if="bookmarkedCount > 0"
              class="nav-count"
              aria-hidden="true"
              >{{ bookmarkedCount }}</span
            ></span
          >
          <span class="nav-label">Bookmarks</span></NuxtLink
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
          ><span class="nav-icon"><i class="bi bi-headphones"></i></span>
          <span class="nav-label">Podcast</span></NuxtLink
        >
      </li>
      <li v-if="authenticationStore.isAuthenticated">
        <NuxtLink
          to="/settings"
          :class="activeRoute == 'settings' ? 'active' : 'inactive'"
          aria-label="Settings"
          ><span class="nav-icon"><i class="bi bi-gear-fill"></i></span>
          <span class="nav-label">Settings</span></NuxtLink
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
const sourcesStore = SourcesStore();
const unreadCount = computed(() => sourcesStore.totalUnreadCount);
const bookmarkedCount = computed(() => sourcesStore.totalSavedCount);
</script>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { EventBus, EventTypes } from "~~/services/EventBus";

// Counts refresh cadences (ms): all triggers funnel into the throttled
// SourcesStore.fetchCountsIfStale, so worst case is 2 small GETs per window.
const COUNTS_TICK_MS = 30 * 1000;
const COUNTS_MIN_AGE_IDLE_MS = 5 * 60 * 1000;
const COUNTS_MIN_AGE_BUSY_MS = 60 * 1000;
const COUNTS_MIN_AGE_ROUTE_MS = 60 * 1000;
const COUNTS_MIN_AGE_RETURN_MS = 30 * 1000;

export default {
  watch: {
    $route(to, from) {
      this.routeUpdated(to);
    },
  },
  data() {
    return {
      activeRoute: "",
      countsTimer: null,
    };
  },
  async created() {
    this.routeUpdated(this.$route);
    EventBus.on(EventTypes.ITEMS_UPDATED, this.itemsUpdated);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    window.addEventListener("focus", this.windowFocused);
    this.countsTimer = setInterval(this.countsTick, COUNTS_TICK_MS);
    if (await AuthenticationStore().ensureAuthenticated()) {
      this.refreshCounts();
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
  beforeUnmount() {
    EventBus.off(EventTypes.ITEMS_UPDATED, this.itemsUpdated);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    window.removeEventListener("focus", this.windowFocused);
    clearInterval(this.countsTimer);
  },
  methods: {
    routeUpdated(newRoute) {
      this.activeRoute = newRoute.path.split("/")[1];
      if (!AuthenticationStore().isAuthenticated) {
        // Reset so a later login (client-side navigation) fetches the counts
        SourcesStore().countsFetchedAt = 0;
        return;
      }
      this.refreshCountsIfStale(COUNTS_MIN_AGE_ROUTE_MS);
    },
    itemsUpdated() {
      if (!AuthenticationStore().isAuthenticated) {
        return;
      }
      // The change may not be visible server-side yet: refresh, then once more shortly after
      this.refreshCounts();
      setTimeout(() => {
        this.refreshCounts();
      }, 2000);
    },
    visibilityChanged() {
      if (document.visibilityState !== "visible") {
        return;
      }
      this.refreshCountsIfStale(COUNTS_MIN_AGE_RETURN_MS);
    },
    windowFocused() {
      this.refreshCountsIfStale(COUNTS_MIN_AGE_RETURN_MS);
    },
    countsTick() {
      if (document.visibilityState !== "visible") {
        return;
      }
      // Poll faster while the server is fetching (counts climb), slower when idle
      this.refreshCountsIfStale(
        UserProcessorInfoStore().status === "idle"
          ? COUNTS_MIN_AGE_IDLE_MS
          : COUNTS_MIN_AGE_BUSY_MS,
      );
    },
    refreshCounts() {
      if (!AuthenticationStore().isAuthenticated) {
        return;
      }
      return SourcesStore().fetchCounts();
    },
    refreshCountsIfStale(maxAgeMs) {
      if (!AuthenticationStore().isAuthenticated) {
        return;
      }
      return SourcesStore().fetchCountsIfStale(maxAgeMs);
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
.menu-links .inactive i,
.menu-links .inactive .nav-label {
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

.nav-icon {
  position: relative;
  display: inline-flex;
}

/* Unread/bookmarked counts as subtle overlays; hidden when zero */
.nav-count {
  position: absolute;
  top: -0.35rem;
  left: calc(100% - 0.45rem);
  font-size: 0.6rem;
  line-height: 1.25;
  font-weight: 600;
  padding: 0 0.28rem;
  min-width: 0.9rem;
  text-align: center;
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary-text);
}

/* Hide nav labels on tablet screens (mobile shows a labeled bottom tab bar) */
@media (min-width: 701px) and (max-width: 1000px) {
  .nav-label {
    display: none;
  }
}

:root[data-theme="light"] .menu-links .inactive i,
:root[data-theme="light"] .menu-links .inactive .nav-label {
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
  }
  .nav-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .menu-links .inactive i,
  .menu-links .inactive .nav-label {
    opacity: 1;
    color: var(--color-text-muted);
  }
  .menu-links .active {
    color: var(--color-primary);
    opacity: 1;
  }
  :root[data-theme="light"] .menu-links .inactive i,
  :root[data-theme="light"] .menu-links .inactive .nav-label {
    /* color-text-muted (#78909c) is only ~3.35:1 on white — below WCAG AA 4.5:1 for 0.7rem labels */
    color: var(--color-text-secondary);
    opacity: 1;
  }
  :root[data-theme="light"] .menu-links .active {
    color: var(--color-primary-dark);
  }
}
</style>
